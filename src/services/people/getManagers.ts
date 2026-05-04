import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ManagerRow } from '@/types/people';

export async function getManagers(
  supabase: SupabaseClient,
  engineerId: string,
): Promise<ManagerRow[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, phone, is_active, created_at')
    .eq('role', 'manager')
    .eq('created_by', engineerId)
    .order('full_name', { ascending: true });

  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id as string,
    fullName: (row.full_name as string) ?? '',
    email: (row.email as string | null) ?? null,
    phone: (row.phone as string | null) ?? null,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at as string,
  }));
}
