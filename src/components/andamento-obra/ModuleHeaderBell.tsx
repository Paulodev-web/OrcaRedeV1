import { createSupabaseServerClient, getCachedAuthUser } from '@/lib/supabaseServer';
import { getCurrentUserProfile } from '@/services/people/getCurrentUserProfile';
import { getNotificationsForUser } from '@/services/notifications/getNotificationsForUser';
import { NotificationsBellRealtimeProvider } from './works/NotificationsBellRealtimeProvider';
import { WorkNotificationsBell } from './works/WorkNotificationsBell';

/**
 * Server Component que busca as últimas notificações do engenheiro logado,
 * envolve o sino num provider Realtime e renderiza. Engineer only.
 * Roda em toda página do módulo (layout raiz) — auth/profile aqui são
 * memoizados por requisição para reaproveitar o que o layout/page da rota já resolveu.
 */
export async function ModuleHeaderBell() {
  const supabase = await createSupabaseServerClient();
  const user = await getCachedAuthUser(supabase);
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
