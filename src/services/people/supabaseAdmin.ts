import 'server-only';
import { createSupabaseServiceRoleClient } from '@/lib/supabaseServer';

/**
 * Cliente Supabase com service role para o módulo de pessoas.
 * Usa exclusivamente em Server Actions e rotas server-side.
 * O `import 'server-only'` no topo do arquivo impede inclusão em qualquer
 * bundle de client component.
 */
export function getSupabaseAdmin() {
  return createSupabaseServiceRoleClient();
}
