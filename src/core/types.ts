export type BigFive = "HOPE" | "DREAM" | "VISION" | "KNOLL" | "APEX";

export type NodeStatus = "idle" | "assigned" | "running" | "completed" | "terminated";

export interface Persona {
  id: string;
  nodeId: string;
  specialty: string;
  active: boolean;
}

export interface WorkerNode {
  id: string;
  managerId: string;
  matrix: BigFive;
  status: NodeStatus;
  personas: Persona[];
  currentTaskId?: string;
  activatedAt?: number;
  terminatedAt?: number;
}

export interface SubManager {
  id: string;
  matrix: BigFive;
  category: number;
  level: number;
  nodes: WorkerNode[];
}

export interface Task {
  id: string;
  type: "delivery" | "simulation" | "execution" | "security" | "governance";
  assignedBy: BigFive;
  targetMatrix?: BigFive;
  payload: any;
  status: "pending" | "assigned" | "running" | "done" | "failed";
  createdAt: number;
  completedAt?: number;
  result?: any;
}

export interface Intent {
  id: string;
  raw: string;
  interpretedBy: "HOPE";
  timestamp: number;
  governanceDecision?: string;
}
