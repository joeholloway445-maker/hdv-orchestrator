import { PrismaClient } from "@prisma/client";

interface TemplateNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

interface TemplateEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  label?: string;
}

interface BuiltInTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  tier: string;
  nodes: TemplateNode[];
  edges: TemplateEdge[];
}

const BUILT_IN_TEMPLATES: BuiltInTemplate[] = [
  {
    id: "tpl-web-scraper-ai-summary",
    name: "Web Scraper + AI Summary",
    description:
      "Fetches a web page on a schedule, sends the raw content through DREAM for AI summarisation, then posts the digest via webhook.",
    category: "ai",
    tier: "STARTER",
    nodes: [
      {
        id: "n1",
        type: "scheduleTrigger",
        position: { x: 60, y: 200 },
        data: {
          label: "Schedule Trigger",
          nodeType: "scheduleTrigger",
          cronExpression: "0 8 * * *",
        },
      },
      {
        id: "n2",
        type: "httpRequest",
        position: { x: 280, y: 200 },
        data: {
          label: "Fetch Page",
          nodeType: "httpRequest",
          method: "GET",
          url: "{{$input.targetUrl || 'https://example.com'}}",
        },
      },
      {
        id: "n3",
        type: "dream",
        position: { x: 500, y: 200 },
        data: {
          label: "DREAM Summarize",
          nodeType: "dream",
          mode: "summarize",
          inputField: "body",
          outputField: "summary",
          maxLength: 500,
        },
      },
      {
        id: "n4",
        type: "httpRequest",
        position: { x: 720, y: 200 },
        data: {
          label: "Webhook Notify",
          nodeType: "httpRequest",
          method: "POST",
          url: "{{$input.notifyUrl || 'https://hooks.example.com/notify'}}",
          body: '{"summary": "{{$input.summary}}", "fetchedAt": "{{$now}}"}',
          contentType: "json",
        },
      },
    ],
    edges: [
      { id: "e1", source: "n1", target: "n2" },
      { id: "e2", source: "n2", target: "n3" },
      { id: "e3", source: "n3", target: "n4" },
    ],
  },
  {
    id: "tpl-vision-webhook-handler",
    name: "VISION Webhook Handler",
    description:
      "Receives a webhook, processes the payload through VISION for automation routing, transforms the result, and posts it back via HTTP.",
    category: "automation",
    tier: "PRO",
    nodes: [
      {
        id: "n1",
        type: "webhookTrigger",
        position: { x: 60, y: 200 },
        data: {
          label: "Webhook Trigger",
          nodeType: "webhookTrigger",
          webhookId: "auto-replace",
          syncResponse: false,
        },
      },
      {
        id: "n2",
        type: "vision",
        position: { x: 280, y: 200 },
        data: {
          label: "VISION Process",
          nodeType: "vision",
          visionMode: "process",
          intent: "{{$input.body.intent}}",
          triggerData: "{{$input.body}}",
        },
      },
      {
        id: "n3",
        type: "transform",
        position: { x: 500, y: 200 },
        data: {
          label: "Transform Output",
          nodeType: "transform",
          keepInput: false,
          mappings: [
            { key: "status", value: "{{$input.visionStatus}}" },
            { key: "result", value: "{{$input.visionResult}}" },
            { key: "processedAt", value: "{{$now}}" },
          ],
        },
      },
      {
        id: "n4",
        type: "httpRequest",
        position: { x: 720, y: 200 },
        data: {
          label: "HTTP POST Result",
          nodeType: "httpRequest",
          method: "POST",
          url: "{{$input.body.callbackUrl || 'https://hooks.example.com/callback'}}",
          body: "{{$input}}",
          contentType: "json",
        },
      },
    ],
    edges: [
      { id: "e1", source: "n1", target: "n2" },
      { id: "e2", source: "n2", target: "n3" },
      { id: "e3", source: "n3", target: "n4" },
    ],
  },
  {
    id: "tpl-security-audit-pipeline",
    name: "Security Audit Pipeline",
    description:
      "Runs on a schedule, fetches the target endpoint, audits the response with KNOLL for security anomalies, then branches to send an email alert on findings.",
    category: "security",
    tier: "ENTERPRISE",
    nodes: [
      {
        id: "n1",
        type: "scheduleTrigger",
        position: { x: 60, y: 200 },
        data: {
          label: "Daily Audit Schedule",
          nodeType: "scheduleTrigger",
          cronExpression: "0 2 * * *",
        },
      },
      {
        id: "n2",
        type: "httpRequest",
        position: { x: 280, y: 200 },
        data: {
          label: "Fetch Target",
          nodeType: "httpRequest",
          method: "GET",
          url: "{{$env.AUDIT_TARGET_URL || 'https://api.example.com/health'}}",
        },
      },
      {
        id: "n3",
        type: "knoll",
        position: { x: 500, y: 200 },
        data: {
          label: "KNOLL Audit",
          nodeType: "knoll",
          maxPayloadKb: "1024",
          checkSsrf: true,
          checkEntropy: true,
          auditMode: true,
        },
      },
      {
        id: "n4",
        type: "ifBranch",
        position: { x: 720, y: 200 },
        data: {
          label: "Findings?",
          nodeType: "ifBranch",
          conditions: [
            { field: "knollFindings", operator: "greaterThan", value: "0" },
          ],
        },
      },
      {
        id: "n5",
        type: "email",
        position: { x: 940, y: 100 },
        data: {
          label: "Email Alert",
          nodeType: "email",
          to: "{{$env.SECURITY_ALERT_EMAIL || 'security@example.com'}}",
          subject: "Security Audit Alert — {{$now}}",
          body2:
            "KNOLL detected {{$input.knollFindings}} security finding(s).\n\nDetails:\n{{$input.knollReport}}",
        },
      },
    ],
    edges: [
      { id: "e1", source: "n1", target: "n2" },
      { id: "e2", source: "n2", target: "n3" },
      { id: "e3", source: "n3", target: "n4" },
      { id: "e4", source: "n4", target: "n5", sourceHandle: "true", label: "findings" },
    ],
  },
  {
    id: "tpl-gpu-batch-inference",
    name: "GPU Batch Inference",
    description:
      "Scheduled batch job: bursts GPU capacity via APEX, runs DREAM generation over the batch, transforms and stores results.",
    category: "ai",
    tier: "ENTERPRISE",
    nodes: [
      {
        id: "n1",
        type: "scheduleTrigger",
        position: { x: 60, y: 200 },
        data: {
          label: "Batch Schedule",
          nodeType: "scheduleTrigger",
          cronExpression: "0 */4 * * *",
        },
      },
      {
        id: "n2",
        type: "apex",
        position: { x: 280, y: 200 },
        data: {
          label: "APEX GPU Burst",
          nodeType: "apex",
          intent: "batch-inference",
          category: "gpu",
          budgetTier: "high",
          gpuBurst: true,
        },
      },
      {
        id: "n3",
        type: "dream",
        position: { x: 500, y: 200 },
        data: {
          label: "DREAM Generate",
          nodeType: "dream",
          mode: "generate",
          batchMode: true,
          outputField: "generated",
        },
      },
      {
        id: "n4",
        type: "transform",
        position: { x: 720, y: 200 },
        data: {
          label: "Transform Results",
          nodeType: "transform",
          keepInput: false,
          mappings: [
            { key: "results", value: "{{$input.generated}}" },
            { key: "model", value: "{{$input.apexModel}}" },
            { key: "completedAt", value: "{{$now}}" },
          ],
        },
      },
      {
        id: "n5",
        type: "set",
        position: { x: 940, y: 200 },
        data: {
          label: "Store Results",
          nodeType: "set",
          mappings: [
            { key: "stored", value: "true" },
            { key: "batchId", value: "{{$input.apexCategory}}-{{$now}}" },
          ],
        },
      },
    ],
    edges: [
      { id: "e1", source: "n1", target: "n2" },
      { id: "e2", source: "n2", target: "n3" },
      { id: "e3", source: "n3", target: "n4" },
      { id: "e4", source: "n4", target: "n5" },
    ],
  },
  {
    id: "tpl-hope-daily-digest",
    name: "HOPE Daily Digest",
    description:
      "Free-tier daily digest: fetches a news or data feed, summarises it with DREAM, and delivers the digest via HOPE notification.",
    category: "productivity",
    tier: "FREE",
    nodes: [
      {
        id: "n1",
        type: "scheduleTrigger",
        position: { x: 60, y: 200 },
        data: {
          label: "Daily 8am",
          nodeType: "scheduleTrigger",
          cronExpression: "0 8 * * *",
        },
      },
      {
        id: "n2",
        type: "httpRequest",
        position: { x: 280, y: 200 },
        data: {
          label: "Fetch Feed",
          nodeType: "httpRequest",
          method: "GET",
          url: "{{$env.DIGEST_FEED_URL || 'https://hnrss.org/frontpage?count=10'}}",
        },
      },
      {
        id: "n3",
        type: "dream",
        position: { x: 500, y: 200 },
        data: {
          label: "DREAM Summarize",
          nodeType: "dream",
          mode: "summarize",
          inputField: "body",
          outputField: "digest",
          maxLength: 300,
        },
      },
      {
        id: "n4",
        type: "hope",
        position: { x: 720, y: 200 },
        data: {
          label: "HOPE Notify",
          nodeType: "hope",
          allowAnon: false,
          notifyMode: true,
          message: "Daily Digest:\n\n{{$input.digest}}",
        },
      },
    ],
    edges: [
      { id: "e1", source: "n1", target: "n2" },
      { id: "e2", source: "n2", target: "n3" },
      { id: "e3", source: "n3", target: "n4" },
    ],
  },
];

/**
 * Seed built-in workflow templates into the WorkflowTemplate table.
 * Uses upsert so it is safe to run repeatedly.
 *
 * @returns number of templates upserted
 */
export async function seedTemplates(prisma: PrismaClient): Promise<number> {
  const db = prisma as unknown as {
    workflowTemplate: {
      upsert: (args: {
        where: { id: string };
        update: Record<string, unknown>;
        create: Record<string, unknown>;
      }) => Promise<unknown>;
    };
  };

  for (const tpl of BUILT_IN_TEMPLATES) {
    await db.workflowTemplate.upsert({
      where: { id: tpl.id },
      update: {
        name: tpl.name,
        description: tpl.description,
        category: tpl.category,
        tier: tpl.tier,
        nodes: tpl.nodes as unknown as Record<string, unknown>[],
        edges: tpl.edges as unknown as Record<string, unknown>[],
      },
      create: {
        id: tpl.id,
        name: tpl.name,
        description: tpl.description,
        category: tpl.category,
        tier: tpl.tier,
        nodes: tpl.nodes as unknown as Record<string, unknown>[],
        edges: tpl.edges as unknown as Record<string, unknown>[],
      },
    });
  }

  return BUILT_IN_TEMPLATES.length;
}
