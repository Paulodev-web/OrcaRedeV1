import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CrewMemberRow } from '@/types/people';

export async function getCrewMembers(
  supabase: SupabaseClient,
  ownerId: string,
): Promise<CrewMemberRow[]> {
  const { data, error } = await supabase
    .from('crew_members')
    .select('id, full_name, role, phone, document_id, notes, is_active, created_at')
    .eq('owner_id', ownerId)
    .order('full_name', { ascending: true });

  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id as string,
    fullName: (row.full_name as string) ?? '',
    role: (row.role as string | null) ?? null,
    phone: (row.phone as string | null) ?? null,
    documentId: (row.document_id as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at as string,
  }));
}
