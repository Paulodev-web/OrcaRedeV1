import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { getCurrentUserProfile } from '@/services/people/getCurrentUserProfile';
import { getNotificationsForUser } from '@/services/notifications/getNotificationsForUser';
import { WorkNotificationsBell } from './works/WorkNotificationsBell';

/**
 * Server Component que busca as últimas notificações do engenheiro logado
 * e renderiza o sino. Mostrado apenas para perfis 'engineer'.
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

  return <WorkNotificationsBell initialItems={items} initialUnreadCount={unreadCount} />;
}
