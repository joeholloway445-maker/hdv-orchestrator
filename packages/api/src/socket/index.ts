import { Server as SocketIOServer, Socket } from "socket.io";
import IORedis from "ioredis";
import jwt from "jsonwebtoken";

export function setupSocketIO(io: SocketIOServer) {
  io.use((socket: Socket, next) => {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.replace("Bearer ", "");
    if (!token) return next(new Error("Authentication required"));
    try {
      jwt.verify(token, process.env.JWT_SECRET!);
      next();
    } catch {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    console.log(`[WS] Client connected: ${socket.id}`);

    socket.on("join-execution", (executionId: string) => {
      socket.join(`execution:${executionId}`);
    });

    socket.on("disconnect", () => {
      console.log(`[WS] Client disconnected: ${socket.id}`);
    });
  });

  const subscriber = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
    maxRetriesPerRequest: null,
  });

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
}
