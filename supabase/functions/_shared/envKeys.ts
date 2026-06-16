const PROJECT_REF = 'ubqyjbtjkzxlexbuxoum';

/** Resolve service-role / secret API keys (legacy JWT + SUPABASE_SECRET_KEYS JSON). */
export function getServiceRoleKey(): string | undefined {
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();
  if (legacy) return legacy;

  const secretKeysJson = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (!secretKeysJson) return undefined;

  try {
    const parsed = JSON.parse(secretKeysJson) as Record<string, string>;
    return (
      parsed.service_role?.trim() ||
      parsed.default?.trim() ||
      Object.values(parsed).find((v) => typeof v === 'string' && v.trim())?.trim()
    );
  } catch {
    return undefined;
  }
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    return JSON.parse(atob(padded)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Accept service_role JWT issued for this Supabase project (Vercel → Edge). */
export function isProjectServiceRoleBearer(token: string | null): boolean {
  if (!token) return false;

  const payload = decodeJwtPayload(token);
  if (!payload) return false;

  const role = payload.role;
  const ref = payload.ref;

  return role === 'service_role' && ref === PROJECT_REF;
}

/** Tokens accepted for server-to-server auth (job secret + service role keys). */
export function getAcceptedAuthTokens(): string[] {
  const tokens = new Set<string>();

  const jobSecret =
    Deno.env.get('INTERNAL_JOB_SECRET')?.trim() ||
    Deno.env.get('ORCAREDE_JOB_SECRET')?.trim();
  if (jobSecret) tokens.add(jobSecret);

  const serviceKey = getServiceRoleKey();
  if (serviceKey) tokens.add(serviceKey);

  const secretKeysJson = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (secretKeysJson) {
    try {
      const parsed = JSON.parse(secretKeysJson) as Record<string, string>;
      for (const value of Object.values(parsed)) {
        if (typeof value === 'string' && value.trim()) tokens.add(value.trim());
      }
    } catch {
      // ignore malformed JSON
    }
  }

  return [...tokens];
}
