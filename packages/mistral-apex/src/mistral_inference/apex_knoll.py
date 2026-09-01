"""
apex_knoll.py — APEX MoE routing + KNOLL validation for Mistral vLLM deployments.

APEX selects the optimal Mistral model variant for a given task intent and budget.
KNOLL validates all inbound request payloads before they reach the inference engine.

Integrates with the vLLM OpenAI-compatible server via the request middleware layer
and is called by hdv-orchestrator when routing workflow AI nodes to this server.
"""

from __future__ import annotations

import ipaddress
import re
from dataclasses import dataclass
from typing import Any, Dict, List, Optional


# ── Model catalog ─────────────────────────────────────────────────────────────

# Mistral variants — map to SERVED_MODEL_NAME values in the vLLM deployment
MISTRAL_7B = "mistral-7b-instruct"
MISTRAL_NEMO = "mistral-nemo-instruct"
MISTRAL_LARGE = "mistral-large"

# Fallback when no budget / category signal is available
_DEFAULT_MODEL = MISTRAL_7B


# ── APEX MoE Router ───────────────────────────────────────────────────────────

@dataclass
class RouteDecision:
    model: str
    category: str
    budget_tier: str
    reasoning: str


def heuristic_route(intent: str, category: str = "general", budget_tier: str = "medium") -> str:
    """
    Select the optimal Mistral model variant for a task.
    Mirrors the TypeScript heuristicRoute() used across the HDV stack.
    """
    low = budget_tier == "low"
    high = budget_tier == "high"
    cat = category.lower()

    if cat in ("security", "audit"):
        return MISTRAL_LARGE if high else MISTRAL_NEMO
    if cat in ("code", "analysis"):
        return MISTRAL_7B if low else (MISTRAL_LARGE if high else MISTRAL_NEMO)
    if cat in ("creative", "simulation"):
        return MISTRAL_NEMO if high else MISTRAL_7B
    if cat in ("vision", "multimodal"):
        return MISTRAL_NEMO
    if cat in ("chat", "support"):
        return MISTRAL_7B

    # Intent-based fallback
    lower = intent.lower()
    if re.search(r"secur|audit|knoll", lower):
        return MISTRAL_LARGE
    if re.search(r"dream|simulat|creat", lower):
        return MISTRAL_NEMO
    if re.search(r"cod|debug|refactor", lower):
        return MISTRAL_7B if low else MISTRAL_NEMO
    return MISTRAL_7B if low else MISTRAL_NEMO


def route_task(intent: str, category: str = "general", budget_tier: str = "medium") -> RouteDecision:
    model = heuristic_route(intent, category, budget_tier)
    return RouteDecision(
        model=model,
        category=category,
        budget_tier=budget_tier,
        reasoning=f"Heuristic: category={category!r} budget={budget_tier!r} → {model}",
    )


# ── KNOLL Validator ───────────────────────────────────────────────────────────

# Keys that must never appear in request payloads
_FORBIDDEN_KEY_PATTERNS: List[re.Pattern] = [re.compile(p, re.IGNORECASE) for p in [
    r"password",
    r"secret",
    r"api[_-]?key",
    r"private[_-]?key",
    r"access[_-]?token",
    r"refresh[_-]?token",
    r"credit[_-]?card",
    r"ssn",
    r"social[_-]?security",
]]

# Private / loopback address blocks forbidden in URLs within payloads
_PRIVATE_NETWORKS = [
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
]

_MAX_PAYLOAD_BYTES = 256 * 1024  # 256 KB


@dataclass
class ValidationResult:
    ok: bool
    violations: List[str]


def _check_forbidden_keys(obj: Any, path: str = "") -> List[str]:
    """Recursively scan a JSON-like object for forbidden key patterns."""
    violations: List[str] = []
    if isinstance(obj, dict):
        for k, v in obj.items():
            full_key = f"{path}.{k}" if path else k
            for pat in _FORBIDDEN_KEY_PATTERNS:
                if pat.search(k):
                    violations.append(f"Forbidden key pattern '{pat.pattern}' at '{full_key}'")
                    break
            violations.extend(_check_forbidden_keys(v, full_key))
    elif isinstance(obj, list):
        for i, item in enumerate(obj):
            violations.extend(_check_forbidden_keys(item, f"{path}[{i}]"))
    return violations


def _extract_urls(obj: Any) -> List[str]:
    """Collect all string values that look like URLs from a JSON-like object."""
    urls: List[str] = []
    if isinstance(obj, dict):
        for v in obj.values():
            urls.extend(_extract_urls(v))
    elif isinstance(obj, list):
        for item in obj:
            urls.extend(_extract_urls(item))
    elif isinstance(obj, str) and re.match(r"https?://", obj, re.IGNORECASE):
        urls.append(obj)
    return urls


def _is_ssrf_url(url: str) -> bool:
    """Return True if the URL resolves to a private/loopback address."""
    match = re.match(r"https?://([^/:]+)", url, re.IGNORECASE)
    if not match:
        return False
    host = match.group(1)
    # Block plain hostname references to private ranges
    if host.lower() in ("localhost", "metadata.google.internal", "169.254.169.254"):
        return True
    try:
        addr = ipaddress.ip_address(host)
        return any(addr in net for net in _PRIVATE_NETWORKS)
    except ValueError:
        # Not a bare IP — DNS resolution not performed here (no network calls in validation)
        return False


def validate_payload(payload: Any, max_bytes: Optional[int] = None) -> ValidationResult:
    """
    KNOLL gate: validate a request payload before it reaches the inference engine.
    Checks:
      1. Payload size (serialize to string for approximate check)
      2. Forbidden key patterns (credential leakage)
      3. SSRF: private IP / loopback in URL string values
    """
    violations: List[str] = []
    limit = max_bytes if max_bytes is not None else _MAX_PAYLOAD_BYTES

    import json
    try:
        serialized = json.dumps(payload)
    except (TypeError, ValueError) as exc:
        return ValidationResult(ok=False, violations=[f"Payload serialization error: {exc}"])

    if len(serialized.encode()) > limit:
        violations.append(f"Payload exceeds {limit} byte limit ({len(serialized.encode())} bytes)")

    violations.extend(_check_forbidden_keys(payload))

    for url in _extract_urls(payload):
        if _is_ssrf_url(url):
            violations.append(f"SSRF: private/loopback address in URL value '{url}'")

    return ValidationResult(ok=len(violations) == 0, violations=violations)


# ── Convenience entry point ───────────────────────────────────────────────────

def process_workflow_request(
    payload: Dict[str, Any],
    intent: str = "",
    category: str = "general",
    budget_tier: str = "medium",
) -> Dict[str, Any]:
    """
    Full APEX+KNOLL processing for a workflow AI node request.
    Returns a dict with routing decision and validation result.
    Called by hdv-orchestrator before forwarding to the vLLM endpoint.
    """
    validation = validate_payload(payload)
    if not validation.ok:
        return {
            "ok": False,
            "violations": validation.violations,
            "model": None,
            "reasoning": "KNOLL rejected payload",
        }

    decision = route_task(intent or str(payload.get("intent", "")), category, budget_tier)
    return {
        "ok": True,
        "violations": [],
        "model": decision.model,
        "category": decision.category,
        "budget_tier": decision.budget_tier,
        "reasoning": decision.reasoning,
    }
