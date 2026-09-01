export type AgentId = "HOPE" | "VISION" | "DREAM" | "KNOLL" | "APEX";

export interface MemoryRecord {
  id: string;
  from: AgentId;
  to: AgentId | "UPWARD";
  timestamp: number;
  content: any;
  tags?: string[];
}

export interface AgentMessage {
  id: string;
  from: AgentId;
  content: any;
  timestamp: number;
}

export interface HapticCommand {
  deviceId?: string;
  intensity: number;      // 0-100
  pattern?: string;       // "pulse" | "wave" | "custom" | etc.
  durationMs?: number;
  meta?: Record<string, any>;
}

export interface WorldState {
  sceneId: string;
  description: string;
  entities: any[];
  mood?: string;
  raw?: any;
}
