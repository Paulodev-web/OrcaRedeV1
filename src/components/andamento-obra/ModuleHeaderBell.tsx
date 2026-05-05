import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { getCurrentUserProfile } from '@/services/people/getCurrentUserProfile';
import { getNotificationsForUser } from '@/services/notifications/getNotificationsForUser';
import { NotificationsBellRealtimeProvider } from './works/NotificationsBellRealtimeProvider';
import { WorkNotificationsBell } from './works/WorkNotificationsBell';

/**
 * Server Component que busca as últimas notificações do engenheiro logado,
 * envolve o sino num provider Realtime e renderiza. Engineer only.
 */
export async function ModuleHeaderBell() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const profile = await getCurrentUserProfile(supabase, user.id);
  if (!profile || profile.role !== 'engineer') return null;

  const { items, unreadCount } = await getNotificationsForUser(supabase, user.id, { limit: 10 });

  return (
    <NotificationsBellRealtimeProvider
      userId={user.id}
      initialItems={items}
      initialUnreadCount={unreadCount}
    >
      <WorkNotificationsBell />
    </NotificationsBellRealtimeProvider>
  );
}
