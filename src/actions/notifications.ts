'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient, requireAuthUserId } from '@/lib/supabaseServer';
import type { ActionResult } from '@/types/works';

const HOME_PATH = '/tools/andamento-obra';

export async function markNotificationAsRead(id: string): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  let userId: string;
  try {
    userId = await requireAuthUserId(supabase);
  } catch {
    return { success: false, error: 'Sessão expirada.' };
  }

  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', id)
    .eq('user_id', userId);

  if (error) return { success: false, error: error.message };

  revalidatePath(HOME_PATH);
  return { success: true };
}

export async function markAllNotificationsAsRead(): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  let userId: string;
  try {
    userId = await requireAuthUserId(supabase);
  } catch {
    return { success: false, error: 'Sessão expirada.' };
  }

  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', userId)
    .eq('is_read', false);

  if (error) return { success: false, error: error.message };

  revalidatePath(HOME_PATH);
  return { success: true };
}
