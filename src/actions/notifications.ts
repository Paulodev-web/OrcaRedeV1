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

const NOTIFICATIONS_PAGE_SIZE = 30;

/**
 * Carrega notificacoes mais antigas (paginacao reversa por created_at).
 */
export async function getOlderNotifications(
  cursor: string,
  filterUnread?: boolean,
): Promise<ActionResult<{ items: import('@/types/works').NotificationRow[]; hasMore: boolean }>> {
  const supabase = await createSupabaseServerClient();
  let userId: string;
  try {
    userId = await requireAuthUserId(supabase);
  } catch {
    return { success: false, error: 'Sessão expirada.' };
  }

  const fetchLimit = NOTIFICATIONS_PAGE_SIZE + 1;
  let query = supabase
    .from('notifications')
    .select('id, user_id, work_id, kind, title, body, link_path, is_read, created_at')
    .eq('user_id', userId)
    .lt('created_at', cursor)
    .order('created_at', { ascending: false })
    .limit(fetchLimit);

  if (filterUnread) {
    query = query.eq('is_read', false);
  }

  const { data, error } = await query;
  if (error || !data) return { success: false, error: error?.message ?? 'Falha ao carregar.' };

  const rows = data as Array<Record<string, unknown>>;
  const hasMore = rows.length > NOTIFICATIONS_PAGE_SIZE;
  const sliced = hasMore ? rows.slice(0, NOTIFICATIONS_PAGE_SIZE) : rows;

  const items: import('@/types/works').NotificationRow[] = sliced.map((row) => ({
    id: row.id as string,
    userId: row.user_id as string,
    workId: (row.work_id as string | null) ?? null,
    kind: row.kind as import('@/types/works').NotificationKind,
    title: row.title as string,
    body: (row.body as string | null) ?? null,
    linkPath: (row.link_path as string | null) ?? null,
    isRead: Boolean(row.is_read),
    createdAt: row.created_at as string,
  }));

  return { success: true, data: { items, hasMore } };
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
