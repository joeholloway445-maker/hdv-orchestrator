import { Server as SocketIOServer, Socket } from "socket.io";
import IORedis from "ioredis";
import jwt from "jsonwebtoken";

interface SocketData {
  userId: string;
  tenantId: string;
}

export function setupSocketIO(io: SocketIOServer) {
  io.use((socket: Socket, next) => {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.replace("Bearer ", "");
    if (!token) return next(new Error("Authentication required"));
    // Try internal JWT first
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET!) as { userId?: string; sub?: string };
      const userId = payload.userId || payload.sub || "unknown";
      (socket.data as SocketData).userId = userId;
      (socket.data as SocketData).tenantId = userId;
      return next();
    } catch { /* fall through */ }
    // Try Supabase JWT if configured
    const supabaseSecret = process.env.SUPABASE_JWT_SECRET;
    if (supabaseSecret) {
      try {
        const payload = jwt.verify(token, supabaseSecret, { algorithms: ["HS256"] }) as { sub?: string; userId?: string };
        const userId = payload.sub || payload.userId || "unknown";
        (socket.data as SocketData).userId = userId;
        (socket.data as SocketData).tenantId = userId;
        return next();
      } catch { /* fall through */ }
    }
    return next(new Error("Invalid token"));
  });

  io.on("connection", (socket) => {
    console.log(`[WS] Client connected: ${socket.id}`);
    const tenantId = (socket.data as SocketData).tenantId;
    if (tenantId) {
      socket.join(`tenant:${tenantId}`);
    }

    socket.on("join-execution", (executionId: string) => {
      socket.join(`execution:${executionId}`);
    });

    socket.on("subscribe:workflow", (workflowId: string) => {
      socket.join(`workflow:${workflowId}`);
    });

    socket.on("disconnect", () => {
      console.log(`[WS] Client disconnected: ${socket.id}`);
    });
  });

  const subscriber = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
    maxRetriesPerRequest: null,
  });

  // Legacy per-execution channel — kept for backward compatibility
  subscriber.subscribe("workflow:telemetry", (err) => {
    if (err) console.error("[WS] Redis subscribe error:", err);
    else console.log("[WS] Subscribed to workflow:telemetry channel");
  });

  subscriber.on("message", (_channel, message) => {
    try {
      const event = JSON.parse(message) as { executionId: string };
      io.to(`execution:${event.executionId}`).emit("telemetry", event);
    } catch (e) {
      console.error("[WS] Failed to parse telemetry:", e);
    }
  });

  // Per-workflow channel — real-time streaming for canvas execution view
  const patternSubscriber = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
    maxRetriesPerRequest: null,
  });

  patternSubscriber.psubscribe("hdv:exec:*", (err) => {
    if (err) console.error("[WS] Redis psubscribe error:", err);
    else console.log("[WS] Subscribed to hdv:exec:* pattern");
  });

  patternSubscriber.on("pmessage", (_pattern, channel, message) => {
    try {
      const data = JSON.parse(message) as { executionId: string; workflowId: string; tenantId?: string };
      const workflowId = channel.replace("hdv:exec:", "");
      io.to(`workflow:${workflowId}`).emit("execution:update", data);
      if (data.tenantId) {
        io.to(`tenant:${data.tenantId}`).emit("execution:update", data);
      }
    } catch (e) {
      console.error("[WS] Failed to parse hdv:exec event:", e);
    }
  });
}
