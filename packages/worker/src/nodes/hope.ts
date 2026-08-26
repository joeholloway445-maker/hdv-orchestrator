/**
 * HOPE auth gateway node — validates user context and enriches workflow data.
 *
 * HOPE is the authentication and user-context guardian of the HDV stack. In the
 * workflow DAG it acts as a gating node that:
 *   1. Validates the user JWT / session token against Supabase Auth
 *   2. Enriches $input with the resolved user profile (id, email, role)
 *   3. Optionally halts the workflow if the user lacks a required role
 *
 * Designed to run at the start of any workflow that touches user data or
 * requires identity-gated actions (payments, persona saves, admin ops).
 *
 * Configuration (node.data):
 *   token         — Bearer token or Supabase session token to validate
 *   requiredRole  — if set, block when user.role !== this value
 *   allowAnon     — when true, pass through even if no valid session found
 *   supabaseUrl   — override for SUPABASE_URL env var
 *   supabaseKey   — override for SUPABASE_ANON_KEY env var
 */

interface NodeDef {
  data: Record<string, unknown>;
}

export interface HopeResult {
  hopeAuthenticated: boolean;
  hopeUserId: string;
  hopeEmail: string;
  hopeRole: string;
  hopeBlocked: boolean;
  hopeBlockReason?: string;
}

function str(v: unknown): string {
  return v !== null && v !== undefined ? String(v) : "";
}

export async function executeHope(
  node: NodeDef,
  $input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const allowAnon = Boolean(node.data.allowAnon ?? false);
  const requiredRole = str(node.data.requiredRole);

  // Resolve token: prefer node data, then $input propagation
  const token = str(node.data.token || $input.hopeToken || $input.token || $input.authorization || "")
    .replace(/^Bearer\s+/i, "");

  const supabaseUrl = str(node.data.supabaseUrl || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "");
  const supabaseKey = str(node.data.supabaseKey || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "");

  if (!token) {
    if (allowAnon) {
      return {
        ...$input,
        hopeAuthenticated: false,
        hopeUserId: "",
        hopeEmail: "",
        hopeRole: "anon",
        hopeBlocked: false,
      } satisfies Record<string, unknown>;
    }
    throw new Error("HOPE: no auth token provided — set data.token or pass hopeToken in $input");
  }

  if (!supabaseUrl || !supabaseKey) {
    // Dev mode: accept any non-empty token as a synthetic user
    const hopeResult: HopeResult = {
      hopeAuthenticated: true,
      hopeUserId: `dev-user-${token.slice(0, 8)}`,
      hopeEmail: "dev@hdv.local",
      hopeRole: requiredRole || "user",
      hopeBlocked: false,
    };
    return { ...$input, ...hopeResult };
  }

  // Validate token against Supabase Auth
  let userId = "";
  let email = "";
  let role = "user";

  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: supabaseKey,
      },
    });

    if (!res.ok) {
      if (allowAnon) {
        return {
          ...$input,
          hopeAuthenticated: false,
          hopeUserId: "",
          hopeEmail: "",
          hopeRole: "anon",
          hopeBlocked: false,
        } satisfies Record<string, unknown>;
      }
      throw new Error(`HOPE: Supabase auth rejected token (HTTP ${res.status})`);
    }

    const user = await res.json() as {
      id?: string;
      email?: string;
      app_metadata?: { role?: string };
      user_metadata?: { role?: string };
    };
    userId = str(user.id);
    email = str(user.email);
    role = str(user.app_metadata?.role || user.user_metadata?.role || "user");
  } catch (err) {
    if (allowAnon) {
      return {
        ...$input,
        hopeAuthenticated: false,
        hopeUserId: "",
        hopeEmail: "",
        hopeRole: "anon",
        hopeBlocked: false,
      } satisfies Record<string, unknown>;
    }
    throw err;
  }

  // Role guard
  if (requiredRole && role !== requiredRole && role !== "admin") {
    const result: HopeResult = {
      hopeAuthenticated: true,
      hopeUserId: userId,
      hopeEmail: email,
      hopeRole: role,
      hopeBlocked: true,
      hopeBlockReason: `Required role '${requiredRole}' not met (got '${role}')`,
    };
    throw new Error(result.hopeBlockReason!);
  }

  const hopeResult: HopeResult = {
    hopeAuthenticated: true,
    hopeUserId: userId,
    hopeEmail: email,
    hopeRole: role,
    hopeBlocked: false,
  };

  return { ...$input, ...hopeResult };
}
