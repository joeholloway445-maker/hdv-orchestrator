import type { NodeProps } from "reactflow";
import { BaseNode } from "./BaseNode";

type ND = { label?: string; cases?: Array<{ value: string; output: string }>; [key: string]: unknown };

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
  <BaseNode {...props} color="bg-blue-700" icon="🌐" hasErrorOutput />
);

export const CodeNode = (props: NodeProps<ND>) => (
  <BaseNode {...props} color="bg-orange-700" icon="</>" hasErrorOutput />
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

export const WaitNode = (props: NodeProps<ND>) => (
  <BaseNode {...props} color="bg-slate-600" icon="⏱" />
);

export const FilterNode = (props: NodeProps<ND>) => (
  <BaseNode {...props} color="bg-emerald-700" icon="⊶" />
);

export const SwitchNode = (props: NodeProps<ND>) => (
  <BaseNode {...props} color="bg-amber-700" icon="⇌" hasSwitchOutputs />
);

export const EmailNode = (props: NodeProps<ND>) => (
  <BaseNode {...props} color="bg-sky-700" icon="✉" hasErrorOutput />
);

export const SubWorkflowNode = (props: NodeProps<ND>) => (
  <BaseNode {...props} color="bg-fuchsia-700" icon="⧉" />
);

export const RespondNode = (props: NodeProps<ND>) => (
  <BaseNode {...props} color="bg-rose-700" icon="↩" hasOutput={false} />
);

export const MemoryReadNode = (props: NodeProps<ND>) => (
  <BaseNode {...props} color="bg-cyan-700" icon="📖" />
);

export const MemoryWriteNode = (props: NodeProps<ND>) => (
  <BaseNode {...props} color="bg-cyan-800" icon="💾" />
);

export const AiNode = (props: NodeProps<ND>) => (
  <BaseNode {...props} color="bg-purple-900" icon="🤖" hasErrorOutput />
);

export const AggregateNode = (props: NodeProps<ND>) => (
  <BaseNode {...props} color="bg-lime-700" icon="⊕" />
);

export const TransformNode = (props: NodeProps<ND>) => (
  <BaseNode {...props} color="bg-teal-600" icon="⇢" />
);

export const DatetimeNode = (props: NodeProps<ND>) => (
  <BaseNode {...props} color="bg-sky-600" icon="📅" />
);

export const CryptoNode = (props: NodeProps<ND>) => (
  <BaseNode {...props} color="bg-gray-700" icon="🔐" />
);

export const SplitBatchesNode = (props: NodeProps<ND>) => (
  <BaseNode {...props} color="bg-orange-600" icon="⊞" />
);

export const ValidateNode = (props: NodeProps<ND>) => (
  <BaseNode {...props} color="bg-red-700" icon="✓" hasErrorOutput />
);

export const NoOpNode = (props: NodeProps<ND>) => (
  <BaseNode {...props} color="bg-gray-500" icon="○" />
);

export const StopErrorNode = (props: NodeProps<ND>) => (
  <BaseNode {...props} color="bg-red-900" icon="⛔" hasOutput={false} />
);

export const JsonPathNode = (props: NodeProps<ND>) => (
  <BaseNode {...props} color="bg-indigo-600" icon="🔎" />
);

export const CsvNode = (props: NodeProps<ND>) => (
  <BaseNode {...props} color="bg-green-700" icon="📊" />
);

export const HtmlExtractNode = (props: NodeProps<ND>) => (
  <BaseNode {...props} color="bg-orange-800" icon="🔍" />
);

export const DatabaseNode = (props: NodeProps<ND>) => (
  <BaseNode {...props} color="bg-green-900" icon="🗄" hasErrorOutput />
);

export const SlackNode = (props: NodeProps<ND>) => (
  <BaseNode {...props} color="bg-purple-600" icon="💬" hasErrorOutput />
);

// ── HDV Big Five ────────────────────────────────────────────────────────────

export const KnollNode = (props: NodeProps<ND>) => (
  <BaseNode {...props} color="bg-red-800" icon="🔒" hasErrorOutput />
);

export const ApexNode = (props: NodeProps<ND>) => (
  <BaseNode {...props} color="bg-purple-700" icon="⚡" hasErrorOutput />
);

export const DreamNode = (props: NodeProps<ND>) => (
  <BaseNode {...props} color="bg-indigo-800" icon="✦" />
);

export const VisionNode = (props: NodeProps<ND>) => (
  <BaseNode {...props} color="bg-cyan-800" icon="👁" />
);

export const HopeNode = (props: NodeProps<ND>) => (
  <BaseNode {...props} color="bg-green-800" icon="🛡" hasErrorOutput />
);

export const StickyNoteNode = (props: NodeProps<ND>) => {
  const label = props.data.label || "Note";
  const text = (props.data.text as string) || "";
  return (
    <div
      className="bg-yellow-200 text-yellow-900 rounded shadow-md p-3 min-w-[160px] max-w-[320px] text-sm"
      style={{ border: "1px solid #ca8a04" }}
    >
      <div className="font-bold text-xs mb-1 uppercase tracking-wide opacity-60">{label}</div>
      <div className="whitespace-pre-wrap break-words">{text || <span className="opacity-40 italic">Double-click to edit</span>}</div>
    </div>
  );
};

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
  wait: WaitNode,
  filter: FilterNode,
  switch: SwitchNode,
  email: EmailNode,
  subWorkflow: SubWorkflowNode,
  respond: RespondNode,
  memoryRead: MemoryReadNode,
  memoryWrite: MemoryWriteNode,
  ai: AiNode,
  aggregate: AggregateNode,
  transform: TransformNode,
  datetime: DatetimeNode,
  crypto: CryptoNode,
  splitBatches: SplitBatchesNode,
  validate: ValidateNode,
  noOp: NoOpNode,
  stopError: StopErrorNode,
  jsonPath: JsonPathNode,
  csv: CsvNode,
  htmlExtract: HtmlExtractNode,
  database: DatabaseNode,
  slack: SlackNode,
  stickyNote: StickyNoteNode,
  // HDV Big Five
  knoll: KnollNode,
  apex: ApexNode,
  dream: DreamNode,
  vision: VisionNode,
  hope: HopeNode,
};
