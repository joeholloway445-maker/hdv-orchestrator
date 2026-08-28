import { useEffect, useState } from "react";
import { io, type Socket } from "socket.io-client";

export type NodeStatus = "running" | "success" | "error" | "skipped";

interface ExecutionUpdateEvent {
  type: string;
  nodeId?: string;
  executionId?: string;
  workflowId?: string;
  tenantId?: string;
  output?: unknown;
  error?: string;
  status?: string;
}

/**
 * Subscribes to real-time execution streaming for a given workflow.
 *
 * Returns a map of nodeId → status, kept current as the worker publishes
 * `hdv:exec:{workflowId}` events via the API's Socket.io bridge.
 *
 * @param workflowId  The workflow to watch. Pass null to disable.
 * @param token       The JWT auth token from useAuthStore.
 */
export function useExecutionSocket(
  workflowId: string | null,
  token: string | null
): Record<string, NodeStatus> {
  const [nodeStatuses, setNodeStatuses] = useState<Record<string, NodeStatus>>({});

  useEffect(() => {
    if (!workflowId || !token) return;

    const socket: Socket = io(
      import.meta.env.VITE_WS_URL || import.meta.env.VITE_API_BASE_URL || "http://localhost:4000",
      { auth: { token } }
    );

    socket.emit("subscribe:workflow", workflowId);

    socket.on("execution:update", (data: ExecutionUpdateEvent) => {
      if (data.type === "execution:start") {
        // New execution starting — reset canvas statuses
        setNodeStatuses({});
      } else if (data.type === "node-started" && data.nodeId) {
        setNodeStatuses((prev) => ({ ...prev, [data.nodeId!]: "running" }));
      } else if (data.type === "node-finished" && data.nodeId) {
        setNodeStatuses((prev) => ({ ...prev, [data.nodeId!]: "success" }));
      } else if (data.type === "node-error" && data.nodeId) {
        setNodeStatuses((prev) => ({ ...prev, [data.nodeId!]: "error" }));
      } else if (data.type === "node-skipped" && data.nodeId) {
        setNodeStatuses((prev) => ({ ...prev, [data.nodeId!]: "skipped" }));
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [workflowId, token]);

  return nodeStatuses;
}
