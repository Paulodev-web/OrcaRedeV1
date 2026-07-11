import 'server-only';
import { cache } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import type { CurrentUserProfile } from '@/types/people';
import { getCurrentUserProfile } from './getCurrentUserProfile';

/**
 * Garante profile de engenheiro após sync/restore do banco (profiles podem sumir).
 * Usa service role só quando o registro não existe.
 */
export const ensureEngineerProfile = cache(async (
  supabase: SupabaseClient,
  userId: string,
): Promise<CurrentUserProfile | null> => {
  const existing = await getCurrentUserProfile(supabase, userId);
  if (existing) return existing;

  const admin = createSupabaseServiceRoleClient();
  const { data: authData, error: authError } = await admin.auth.admin.getUserById(userId);
  if (authError || !authData?.user) return null;

  const u = authData.user;
  const meta = u.user_metadata ?? {};
  const role =
    meta.role === 'manager' && meta.created_by ? 'manager' : 'engineer';
  const createdBy =
    role === 'manager' && typeof meta.created_by === 'string'
      ? meta.created_by
      : null;

  const fullName =
    (typeof meta.full_name === 'string' && meta.full_name.trim()) ||
    (u.email?.split('@')[0] ?? 'Engenheiro');

  const { error: insertError } = await admin.from('profiles').upsert(
    {
      id: userId,
      full_name: fullName,
      phone: typeof meta.phone === 'string' ? meta.phone : null,
      email: u.email ?? null,
      role,
      created_by: createdBy,
      is_active: true,
    },
    { onConflict: 'id' },
  );

  if (insertError) {
    console.error('[ensureEngineerProfile] insert failed:', insertError);
    return null;
  }

  return getCurrentUserProfile(supabase, userId);
});
