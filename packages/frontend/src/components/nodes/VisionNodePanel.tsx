import { useState } from "react";
import { StudioGate } from "../StudioGate";

interface Props {
  data: Record<string, unknown>;
  onChange: (data: Record<string, unknown>) => void;
}

const inputCls =
  "w-full bg-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500";
const labelCls = "text-gray-400 text-xs mb-1 block";

function cronToHuman(cron: string): string {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return cron;
  const [min, hour, , , dow] = parts;
  if (min === "*" && hour === "*") return "Every minute";
  if (min.startsWith("*/") && hour === "*")
    return `Every ${min.slice(2)} minutes`;
  if (hour === "*" && min !== "*") return `At minute ${min} of every hour`;
  if (min === "0" && hour !== "*" && dow === "*")
    return `Every day at ${hour}:00 UTC`;
  if (min !== "*" && hour !== "*" && dow !== "*")
    return `At ${hour}:${min.padStart(2, "0")} UTC on day-of-week ${dow}`;
  return cron;
}

function generateWebhookId(): string {
  return (
    Math.random().toString(36).slice(2, 10) +
    Math.random().toString(36).slice(2, 6)
  );
}

const CRON_PRESETS = [
  { label: "Daily 9am", value: "0 9 * * *" },
  { label: "Hourly", value: "0 * * * *" },
  { label: "Weekdays", value: "0 9 * * 1-5" },
  { label: "Weekly Mon", value: "0 0 * * 1" },
];

export function VisionNodePanel({ data, onChange }: Props) {
  const [local, setLocal] = useState<Record<string, unknown>>(data);

  function patch(partial: Record<string, unknown>) {
    const next = { ...local, ...partial };
    setLocal(next);
    onChange(next);
  }

  const triggerType = (local.triggerType as string) || "webhook";
  const cronExpression = (local.cronExpression as string) || "0 9 * * *";
  const webhookId = (local.webhookId as string) || "";
  const eventName = (local.eventName as string) || "";
  const baseUrl =
    typeof import.meta !== "undefined"
      ? (import.meta as { env?: Record<string, string> }).env
          ?.VITE_API_BASE_URL ?? "http://localhost:4000"
      : "http://localhost:4000";
  const webhookUrl = webhookId ? `${baseUrl}/webhooks/trigger/${webhookId}` : "";

  return (
    <StudioGate studio="VISION">
      <div className="space-y-4 p-4">
        <div>
          <label className={labelCls}>Trigger Type</label>
          <select
            className={inputCls}
            value={triggerType}
            onChange={(e) => patch({ triggerType: e.target.value })}
          >
            <option value="webhook">Webhook</option>
            <option value="schedule">Schedule</option>
            <option value="event">Event</option>
          </select>
        </div>

        {triggerType === "schedule" && (
          <>
            <div>
              <label className={labelCls}>Cron Expression</label>
              <input
                className={inputCls + " font-mono"}
                value={cronExpression}
                onChange={(e) => patch({ cronExpression: e.target.value })}
                placeholder="0 9 * * *"
              />
              <p className="text-xs text-cyan-400 mt-1">
                {cronToHuman(cronExpression)}
              </p>
            </div>
            <div className="flex flex-wrap gap-1">
              {CRON_PRESETS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  className="text-xs px-2 py-0.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition"
                  onClick={() => patch({ cronExpression: p.value })}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </>
        )}

        {triggerType === "webhook" && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className={labelCls + " mb-0"}>Webhook URL</label>
              <button
                onClick={() => patch({ webhookId: generateWebhookId() })}
                className="text-xs text-cyan-400 hover:underline"
              >
                {webhookId ? "Regenerate" : "Generate"}
              </button>
            </div>
            {webhookUrl ? (
              <>
                <input
                  className={inputCls + " font-mono text-xs"}
                  value={webhookUrl}
                  readOnly
                />
                <button
                  onClick={() => navigator.clipboard.writeText(webhookUrl)}
                  className="text-xs text-blue-400 hover:underline mt-0.5"
                >
                  Copy URL
                </button>
              </>
            ) : (
              <p className="text-xs text-gray-500">
                Click Generate to create a webhook URL.
              </p>
            )}
          </div>
        )}

        {triggerType === "event" && (
          <div>
            <label className={labelCls}>Event Name</label>
            <input
              className={inputCls}
              value={eventName}
              onChange={(e) => patch({ eventName: e.target.value })}
              placeholder="e.g. user.signup, order.created"
            />
          </div>
        )}
      </div>
    </StudioGate>
  );
}
