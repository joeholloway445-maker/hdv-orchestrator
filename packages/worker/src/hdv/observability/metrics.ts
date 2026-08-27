/**
 * observability/metrics.ts — ExecutionMetrics for the HDV DAG executor.
 *
 * Ported from HDV_Foundation/observability/metrics.ts and adapted for the orchestrator:
 * - DispatchEvent (APEX router) → ExecutionEvent (DAG node execution)
 * - AgentRole → string (node types in the workflow graph)
 * - Removed the ephemeral-personas gauge (APEX-specific concept, not applicable here)
 *
 * Strictly out-of-band: plugs into the executor's read-only ExecutionObserver seam and
 * never influences scheduling, routing, or security decisions. snapshot() and toPrometheus()
 * are pure reads callable at any time. Zero external dependencies.
 */

/** Outcome of a single node execution in the workflow DAG. */
export type ExecutionStatus = 'SUCCESS' | 'FAILED' | 'SKIPPED' | 'BLOCKED';

/**
 * A completed node execution event emitted by the DAG executor. Consumed by observers
 * (metrics, tracing) after the fact — never used to alter execution.
 */
export interface ExecutionEvent {
  /** Unique workflow execution run id. */
  executionId: string;
  /** Workflow node id. */
  nodeId: string;
  /** The node type (e.g. "ai", "http", "code", "filter", "knoll"). */
  nodeType: string;
  /** Execution outcome. */
  status: ExecutionStatus;
  /** Wall-clock duration of the node execution in milliseconds. */
  durationMs: number;
  /** Estimated cost in USD (0 for non-AI nodes). Defaults to 0. */
  cost_usd?: number;
  /** Human-readable denial or failure reason (used for denyReasons counter). */
  reason?: string;
}

/** Receive a completed execution event. Must never throw (wrap in combineObservers). */
export type ExecutionObserver = (event: ExecutionEvent) => void;

/** Upper bounds (inclusive, in ms) for the latency histogram. `+Inf` is implicit. */
export const LATENCY_BUCKETS_MS = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000] as const;

/** How long the active-window gauge tracks recent executions. */
export const DEFAULT_ACTIVE_WINDOW_MS = 5_000;

export interface HistogramSnapshot {
  /** Cumulative counts keyed by the bucket upper bound (`"+Inf"` for the overflow bucket). */
  buckets: Record<string, number>;
  count: number;
  sumMs: number;
  /** Mean latency in ms (0 when no samples yet). */
  averageMs: number;
}

export interface MetricsSnapshot {
  startedAt: number;
  uptimeMs: number;
  executions: {
    total: number;
    succeeded: number;
    failed: number;
    skipped: number;
    blocked: number;
  };
  perNodeType: Record<string, number>;
  denyReasons: Record<string, number>;
  latencyMs: HistogramSnapshot;
  cost: { totalUsd: number };
}

export interface MetricsCollectorOptions {
  /** Injectable clock (ms). Defaults to `Date.now` — override for deterministic tests. */
  now?: () => number;
}

export class ExecutionMetrics {
  readonly startedAt: number;
  private readonly now: () => number;

  private total = 0;
  private succeeded = 0;
  private failed = 0;
  private skipped = 0;
  private blocked = 0;
  private totalCostUsd = 0;

  private readonly perNodeType = new Map<string, number>();
  private readonly denyReasons = new Map<string, number>();

  /** Parallel arrays over LATENCY_BUCKETS_MS plus a trailing overflow (`+Inf`) slot. */
  private readonly bucketCounts = new Array<number>(LATENCY_BUCKETS_MS.length + 1).fill(0);
  private latencyCount = 0;
  private latencySumMs = 0;

  constructor(options: MetricsCollectorOptions = {}) {
    this.now = options.now ?? Date.now;
    this.startedAt = this.now();
  }

  /** Bind this collector as an ExecutionObserver. */
  observer(): ExecutionObserver {
    return (event) => this.observe(event);
  }

  /** Record a single execution outcome. Pure accounting — never mutates the event. */
  observe(event: ExecutionEvent): void {
    this.total += 1;
    switch (event.status) {
      case 'SUCCESS':
        this.succeeded += 1;
        break;
      case 'FAILED':
        this.failed += 1;
        if (event.reason) {
          this.denyReasons.set(event.reason, (this.denyReasons.get(event.reason) ?? 0) + 1);
        }
        break;
      case 'SKIPPED':
        this.skipped += 1;
        break;
      case 'BLOCKED':
        this.blocked += 1;
        if (event.reason) {
          this.denyReasons.set(event.reason, (this.denyReasons.get(event.reason) ?? 0) + 1);
        }
        break;
    }

    const key = event.nodeType || 'unknown';
    this.perNodeType.set(key, (this.perNodeType.get(key) ?? 0) + 1);
    this.totalCostUsd = round6(this.totalCostUsd + (event.cost_usd ?? 0));
    this.recordLatency(event.durationMs);
  }

  private recordLatency(durationMs: number): void {
    const d = Number.isFinite(durationMs) && durationMs >= 0 ? durationMs : 0;
    this.latencyCount += 1;
    this.latencySumMs += d;
    let placed = false;
    for (let i = 0; i < LATENCY_BUCKETS_MS.length; i++) {
      if (d <= LATENCY_BUCKETS_MS[i]) {
        this.bucketCounts[i] += 1;
        placed = true;
        break;
      }
    }
    if (!placed) this.bucketCounts[this.bucketCounts.length - 1] += 1;
  }

  /** Cumulative-per-bucket histogram view (Prometheus semantics: each le includes lesser). */
  private histogram(): HistogramSnapshot {
    const buckets: Record<string, number> = {};
    let cumulative = 0;
    for (let i = 0; i < LATENCY_BUCKETS_MS.length; i++) {
      cumulative += this.bucketCounts[i];
      buckets[String(LATENCY_BUCKETS_MS[i])] = cumulative;
    }
    cumulative += this.bucketCounts[this.bucketCounts.length - 1];
    buckets['+Inf'] = cumulative;
    return {
      buckets,
      count: this.latencyCount,
      sumMs: round6(this.latencySumMs),
      averageMs: this.latencyCount === 0 ? 0 : round6(this.latencySumMs / this.latencyCount),
    };
  }

  /** A JSON-friendly point-in-time snapshot of everything measured so far. */
  snapshot(nowTs: number = this.now()): MetricsSnapshot {
    return {
      startedAt: this.startedAt,
      uptimeMs: Math.max(0, nowTs - this.startedAt),
      executions: {
        total: this.total,
        succeeded: this.succeeded,
        failed: this.failed,
        skipped: this.skipped,
        blocked: this.blocked,
      },
      perNodeType: mapToRecord(this.perNodeType),
      denyReasons: mapToRecord(this.denyReasons),
      latencyMs: this.histogram(),
      cost: { totalUsd: this.totalCostUsd },
    };
  }

  /** Render a Prometheus text exposition (v0.0.4 format). Pure read. */
  toPrometheus(nowTs: number = this.now()): string {
    const snap = this.snapshot(nowTs);
    const lines: string[] = [];

    lines.push('# HELP hdv_executions_total Node executions processed by the DAG executor.');
    lines.push('# TYPE hdv_executions_total counter');
    lines.push(`hdv_executions_total{status="succeeded"} ${snap.executions.succeeded}`);
    lines.push(`hdv_executions_total{status="failed"} ${snap.executions.failed}`);
    lines.push(`hdv_executions_total{status="skipped"} ${snap.executions.skipped}`);
    lines.push(`hdv_executions_total{status="blocked"} ${snap.executions.blocked}`);

    lines.push('# HELP hdv_executions_by_node_type_total Executions by node type.');
    lines.push('# TYPE hdv_executions_by_node_type_total counter');
    for (const [nodeType, n] of Object.entries(snap.perNodeType)) {
      lines.push(`hdv_executions_by_node_type_total{node_type="${escapeLabel(nodeType)}"} ${n}`);
    }

    lines.push('# HELP hdv_deny_reasons_total Failure/block count by reason.');
    lines.push('# TYPE hdv_deny_reasons_total counter');
    for (const [reason, n] of Object.entries(snap.denyReasons)) {
      lines.push(`hdv_deny_reasons_total{reason="${escapeLabel(reason)}"} ${n}`);
    }

    lines.push('# HELP hdv_execution_duration_ms Node execution latency histogram.');
    lines.push('# TYPE hdv_execution_duration_ms histogram');
    for (const [le, n] of Object.entries(snap.latencyMs.buckets)) {
      lines.push(`hdv_execution_duration_ms_bucket{le="${escapeLabel(le)}"} ${n}`);
    }
    lines.push(`hdv_execution_duration_ms_sum ${snap.latencyMs.sumMs}`);
    lines.push(`hdv_execution_duration_ms_count ${snap.latencyMs.count}`);

    lines.push('# HELP hdv_cost_usd_total Total estimated AI cost in USD.');
    lines.push('# TYPE hdv_cost_usd_total counter');
    lines.push(`hdv_cost_usd_total ${snap.cost.totalUsd}`);

    return lines.join('\n') + '\n';
  }

  /** Reset all counters (useful between test cases). */
  reset(): void {
    this.total = this.succeeded = this.failed = this.skipped = this.blocked = 0;
    this.totalCostUsd = 0;
    this.perNodeType.clear();
    this.denyReasons.clear();
    this.bucketCounts.fill(0);
    this.latencyCount = 0;
    this.latencySumMs = 0;
  }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function mapToRecord(map: Map<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of map) out[k] = v;
  return out;
}

function escapeLabel(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

/** Round to 6 decimal places to remove floating-point dust. */
function round6(n: number): number {
  return Math.round((n + Number.EPSILON) * 1e6) / 1e6;
}
