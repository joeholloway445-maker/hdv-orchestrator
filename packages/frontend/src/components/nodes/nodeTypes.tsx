import type { NodeProps } from "reactflow";
import { BaseNode } from "./BaseNode";

type ND = { label?: string; [key: string]: unknown };

export const WebhookTriggerNode = (props: NodeProps<ND>) => (
  <BaseNode {...props} color="bg-purple-700" icon="🪝" hasInput={false} />
);

export const ManualTriggerNode = (props: NodeProps<ND>) => (
  <BaseNode {...props} color="bg-indigo-700" icon="▶" hasInput={false} />
);

export const ScheduleTriggerNode = (props: NodeProps<ND>) => (
  <BaseNode {...props} color="bg-indigo-800" icon="🕐" hasInput={false} />
);

export const HttpRequestNode = (props: NodeProps<ND>) => (
  <BaseNode {...props} color="bg-blue-700" icon="🌐" />
);

export const CodeNode = (props: NodeProps<ND>) => (
  <BaseNode {...props} color="bg-orange-700" icon="</>" />
);

export const IfBranchNode = (props: NodeProps<ND>) => (
  <BaseNode {...props} color="bg-yellow-700" icon="⑂" hasTrueOutput hasFalseOutput />
);

export const SetNode = (props: NodeProps<ND>) => (
  <BaseNode {...props} color="bg-teal-700" icon="✏" />
);

export const MergeNode = (props: NodeProps<ND>) => (
  <BaseNode {...props} color="bg-pink-700" icon="⇒" />
);

export const LoopNode = (props: NodeProps<ND>) => (
  <BaseNode {...props} color="bg-violet-700" icon="↺" />
);

export const MemoryReadNode = (props: NodeProps<ND>) => (
  <BaseNode {...props} color="bg-cyan-700" icon="📖" />
);

export const MemoryWriteNode = (props: NodeProps<ND>) => (
  <BaseNode {...props} color="bg-cyan-800" icon="💾" />
);

export const nodeTypes = {
  webhookTrigger: WebhookTriggerNode,
  manualTrigger: ManualTriggerNode,
  scheduleTrigger: ScheduleTriggerNode,
  httpRequest: HttpRequestNode,
  code: CodeNode,
  ifBranch: IfBranchNode,
  set: SetNode,
  merge: MergeNode,
  loop: LoopNode,
  memoryRead: MemoryReadNode,
  memoryWrite: MemoryWriteNode,
};
