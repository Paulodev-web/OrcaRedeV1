import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  NotificationKind,
  NotificationRow,
  NotificationsResult,
} from '@/types/works';

interface Options {
  limit?: number;
  onlyUnread?: boolean;
}

export async function getNotificationsForUser(
  supabase: SupabaseClient,
  userId: string,
  options: Options = {},
): Promise<NotificationsResult> {
  const limit = options.limit ?? 30;
  const onlyUnread = options.onlyUnread ?? false;

  let query = supabase
    .from('notifications')
    .select('id, user_id, work_id, kind, title, body, link_path, is_read, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (onlyUnread) query = query.eq('is_read', false);

  const { data, error } = await query;

  const items: NotificationRow[] =
    error || !data
      ? []
      : data.map((row) => ({
          id: row.id as string,
          userId: row.user_id as string,
          workId: (row.work_id as string | null) ?? null,
          kind: row.kind as NotificationKind,
          title: row.title as string,
          body: (row.body as string | null) ?? null,
          linkPath: (row.link_path as string | null) ?? null,
          isRead: Boolean(row.is_read),
          createdAt: row.created_at as string,
        }));

  const { count } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false);

  return { items, unreadCount: count ?? 0 };
}
