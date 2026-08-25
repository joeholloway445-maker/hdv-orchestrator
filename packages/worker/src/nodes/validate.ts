interface NodeDef {
  data: Record<string, unknown>;
}

function checkType(value: unknown, type: string): boolean {
  if (type === "any") return true;
  if (type === "string") return typeof value === "string";
  if (type === "number") return typeof value === "number";
  if (type === "boolean") return typeof value === "boolean";
  if (type === "array") return Array.isArray(value);
  if (type === "object") return value !== null && typeof value === "object" && !Array.isArray(value);
  if (type === "null") return value === null;
  return true;
}

interface FieldRule {
  field: string;
  type?: string;
  required?: boolean;
  minLength?: string;
  maxLength?: string;
  pattern?: string;
  min?: string;
  max?: string;
}

export function executeValidate(node: NodeDef, $input: Record<string, unknown>): Record<string, unknown> {
  const rules = (node.data?.rules as FieldRule[]) || [];
  const mode = String(node.data?.mode || "throw"); // "throw" | "flag"
  const errors: string[] = [];

  for (const rule of rules) {
    if (!rule.field) continue;
    const value = rule.field
      .split(".")
      .reduce((obj: unknown, k: string) => (obj && typeof obj === "object" ? (obj as Record<string, unknown>)[k] : undefined), $input as unknown);

    if (rule.required && (value === undefined || value === null || value === "")) {
      errors.push(`"${rule.field}" is required`);
      continue;
    }
    if (value === undefined || value === null) continue;

    if (rule.type && !checkType(value, rule.type)) {
      errors.push(`"${rule.field}" must be ${rule.type}, got ${typeof value}`);
    }
    if (rule.minLength && typeof value === "string" && value.length < parseInt(rule.minLength)) {
      errors.push(`"${rule.field}" must be at least ${rule.minLength} characters`);
    }
    if (rule.maxLength && typeof value === "string" && value.length > parseInt(rule.maxLength)) {
      errors.push(`"${rule.field}" must be at most ${rule.maxLength} characters`);
    }
    if (rule.pattern && typeof value === "string" && !new RegExp(rule.pattern).test(value)) {
      errors.push(`"${rule.field}" does not match pattern /${rule.pattern}/`);
    }
    if (rule.min !== undefined && typeof value === "number" && value < parseFloat(rule.min)) {
      errors.push(`"${rule.field}" must be >= ${rule.min}`);
    }
    if (rule.max !== undefined && typeof value === "number" && value > parseFloat(rule.max)) {
      errors.push(`"${rule.field}" must be <= ${rule.max}`);
    }
  }

  if (errors.length > 0 && mode === "throw") {
    throw new Error(`Validation failed: ${errors.join("; ")}`);
  }

  return {
    ...$input,
    _validationPassed: errors.length === 0,
    _validationErrors: errors,
  };
}
