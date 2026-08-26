export type StatusValue =
  | "success" | "SUCCESS"
  | "error" | "ERROR" | "failed" | "FAILED"
  | "running" | "RUNNING"
  | "pending" | "PENDING"
  | "skipped" | "SKIPPED"
  | string;

interface StatusChipProps {
  status: StatusValue;
  className?: string;
}

const CHIP_STYLES: Record<string, { bg: string; text: string; pulse?: boolean }> = {
  SUCCESS:  { bg: "bg-green-900/70",   text: "text-green-300" },
  FAILED:   { bg: "bg-red-900/70",     text: "text-red-300" },
  ERROR:    { bg: "bg-red-900/70",     text: "text-red-300" },
  RUNNING:  { bg: "bg-[#3B6FFF]/20",   text: "text-[#3B6FFF]", pulse: true },
  PENDING:  { bg: "bg-gray-700/60",    text: "text-gray-400" },
  SKIPPED:  { bg: "bg-gray-800/60",    text: "text-gray-500" },
};

export function StatusChip({ status, className = "" }: StatusChipProps) {
  const key = status.toUpperCase();
  const style = CHIP_STYLES[key] ?? { bg: "bg-gray-700", text: "text-gray-400" };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold ${style.bg} ${style.text} ${className}`}
    >
      {style.pulse && (
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#3B6FFF] animate-pulse" />
      )}
      {key}
    </span>
  );
}
