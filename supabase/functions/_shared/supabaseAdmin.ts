import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.100.1';
import { getServiceRoleKey } from './envKeys.ts';

let adminClient: SupabaseClient | null = null;

export function createAdminClient(): SupabaseClient {
  if (adminClient) return adminClient;

  const url = Deno.env.get('SUPABASE_URL') ?? Deno.env.get('NEXT_PUBLIC_SUPABASE_URL');
  const serviceKey = getServiceRoleKey();

  if (!url || !serviceKey) {
    throw new Error('SUPABASE_URL e service role key são obrigatórios na Edge.');
  }

  adminClient = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return adminClient;
}
