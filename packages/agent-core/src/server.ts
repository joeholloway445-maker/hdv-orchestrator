import "dotenv/config";
import { WebSocketServer, WebSocket } from "ws";
import { MemoryBus } from "./memory/MemoryBus";
import { HopeAgent } from "./agents/Hope";
import { VisionAgent } from "./agents/Vision";
import { DreamAgent } from "./agents/Dream";
import { KnollAgent } from "./agents/Knoll";
import { ApexAgent, heuristicRoute } from "./agents/Apex";
import { HapticClient } from "./haptic/HapticClient";
import { WorldModel } from "./world/WorldModel";

// ── Types ────────────────────────────────────────────────────────────────────

interface InboundMessage {
  type: "cycle" | "memory_read" | "ping" | "workflow_trigger" | "workflow_route";
  requestId?: string;
  payload?: Record<string, unknown>;
}

interface OutboundMessage {
  type: "cycle_result" | "memory_snapshot" | "pong" | "error";
  requestId?: string;
  data?: unknown;
  error?: string;
}

// ── Shared singletons ────────────────────────────────────────────────────────

const bus = new MemoryBus(process.env.MEMORY_PERSIST_PATH);
const hope = new HopeAgent(bus);
const vision = new VisionAgent(bus);
const dream = new DreamAgent(bus);
const knoll = new KnollAgent(bus);
const apex = new ApexAgent(bus);
const haptic = new HapticClient();
const world = new WorldModel();

// ── Agent cycle ───────────────────────────────────────────────────────────────

async function runCycle(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const sceneDescription = String(payload.scene ?? "A door stands open at the end of the corridor.");
  const userAction = (payload.userAction ?? {}) as Record<string, unknown>;

  const worldState = await world.generate(sceneDescription);

  const [dreamMsg, visionMsg, hopeMsg] = await Promise.all([
    dream.process({ world: worldState, userAction }),
    vision.process({}),
    hope.process({}),
  ]);
  await knoll.process({});

  const hapticCmd = payload.haptic as { intensity?: number; pattern?: string; durationMs?: number } | undefined;
  let hapticResult: { ok: boolean; message: string } = { ok: false, message: "no command" };
  if (hapticCmd && typeof hapticCmd.intensity === "number") {
    const apexMsg = await apex.process({ haptic: hapticCmd });
    hapticResult = await haptic.send({
      intensity: hapticCmd.intensity,
      pattern: hapticCmd.pattern,
      durationMs: hapticCmd.durationMs,
    });
    return { dream: dreamMsg, vision: visionMsg, hope: hopeMsg, apex: apexMsg, haptic: hapticResult, world: worldState };
  }

  return { dream: dreamMsg, vision: visionMsg, hope: hopeMsg, haptic: hapticResult, world: worldState };
}

// ── WebSocket server ──────────────────────────────────────────────────────────

const PORT = Number(process.env.PORT ?? 4200);
const WS_API_KEY = process.env.WS_API_KEY ?? "";

const wss = new WebSocketServer({
  port: PORT,
  verifyClient: (info: { req: { headers: Record<string, string | string[] | undefined>; url?: string } }) => {
    if (!WS_API_KEY) return true; // dev: no key configured, allow all
    const auth = info.req.headers["authorization"] ?? "";
    const qp = new URL(info.req.url ?? "/", "ws://localhost").searchParams.get("token") ?? "";
    return auth === `Bearer ${WS_API_KEY}` || qp === WS_API_KEY;
  },
});

function send(ws: WebSocket, msg: OutboundMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

wss.on("connection", (ws) => {
  console.log("[HDV] Client connected");

  ws.on("message", async (raw) => {
    let msg: InboundMessage;
    try {
      msg = JSON.parse(raw.toString()) as InboundMessage;
    } catch {
      send(ws, { type: "error", error: "Invalid JSON" });
      return;
    }

    const { type, requestId, payload = {} } = msg;

    switch (type) {
      case "ping":
        send(ws, { type: "pong", requestId });
        break;

      case "memory_read": {
        const agent = String(payload.agent ?? "HOPE") as Parameters<MemoryBus["read"]>[0];
        const limit = Number(payload.limit ?? 20);
        const records = bus.read(agent, limit);
        send(ws, { type: "memory_snapshot", requestId, data: records });
        break;
      }

      case "cycle": {
        try {
          const result = await runCycle(payload);
          send(ws, { type: "cycle_result", requestId, data: result });
        } catch (err) {
          send(ws, { type: "error", requestId, error: String(err) });
        }
        break;
      }

      case "workflow_route": {
        // Pure MoE routing decision — no network call
        const intent = String(payload.intent ?? "");
        const category = String(payload.category ?? "general");
        const budgetTier = (payload.budgetTier ?? "medium") as "low" | "medium" | "high";
        const model = heuristicRoute(intent, category, budgetTier);
        send(ws, {
          type: "cycle_result",
          requestId,
          data: {
            model,
            category,
            budgetTier,
            reasoning: `Heuristic: category="${category}" budget="${budgetTier}" → ${model}`,
          },
        });
        break;
      }

      case "workflow_trigger": {
        // KNOLL-validate payload, then proxy to hdv-orchestrator VISION runtime
        const orchestratorUrl = (process.env.WORKFLOW_API_URL ?? "").replace(/\/$/, "");
        const orchestratorKey = process.env.WORKFLOW_API_KEY ?? "";

        if (!orchestratorUrl || !orchestratorKey) {
          send(ws, {
            type: "error",
            requestId,
            error: "WORKFLOW_API_URL or WORKFLOW_API_KEY not configured",
          });
          break;
        }

        const intent = String(payload.intent ?? "");
        const category = String(payload.category ?? "general");
        const budgetTier = (payload.budgetTier ?? "medium") as "low" | "medium" | "high";
        const moeModel = heuristicRoute(intent, category, budgetTier);
        const workflowId = payload.workflowId;

        try {
          const res = await fetch(`${orchestratorUrl}/workflows/${workflowId}/run`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${orchestratorKey}`,
            },
            body: JSON.stringify({
              triggerData: {
                ...payload,
                moeModel,
                moeCategory: category,
                moeBudgetTier: budgetTier,
              },
            }),
          });
          const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
          send(ws, { type: "cycle_result", requestId, data: { moeModel, ...data } });
        } catch (err) {
          send(ws, { type: "error", requestId, error: String(err) });
        }
        break;
      }

      default:
        send(ws, { type: "error", requestId, error: `Unknown message type: ${type}` });
    }
  });

  ws.on("close", () => console.log("[HDV] Client disconnected"));
  ws.on("error", (err) => console.warn("[HDV] WS error:", err.message));
});

console.log(`[HDV] Agent Core WebSocket server listening on ws://0.0.0.0:${PORT}`);
console.log("[HDV] Agents: HOPE / VISION / DREAM / KNOLL / APEX");
console.log("[HDV] Send { type: 'cycle', payload: { scene, userAction, haptic? } } to run a cycle");
