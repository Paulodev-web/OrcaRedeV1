import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CurrentUserProfile, ProfileRole } from '@/types/people';

export async function getCurrentUserProfile(
  supabase: SupabaseClient,
  userId: string,
): Promise<CurrentUserProfile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, phone, role, is_active')
    .eq('id', userId)
    .maybeSingle();

  if (error || !data) return null;

  return {
    id: data.id as string,
    fullName: (data.full_name as string) ?? '',
    email: (data.email as string | null) ?? null,
    phone: (data.phone as string | null) ?? null,
    role: data.role as ProfileRole,
    isActive: Boolean(data.is_active),
  };
}
