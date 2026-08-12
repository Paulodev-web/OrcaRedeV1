import { createSupabaseServerClient, getCachedAuthUser } from '@/lib/supabaseServer';
import { getNotificationsForUser } from '@/services/notifications/getNotificationsForUser';
import { NotificationsBellRealtimeProvider } from '@/components/andamento-obra/works/NotificationsBellRealtimeProvider';
import { TaskNotificationsBell } from './TaskNotificationsBell';

/**
 * Server Component que busca as notificações do módulo Tarefas (module_key=
 * 'tarefas') para o usuário logado e envolve o sino num provider Realtime.
 * Ao contrário de `ModuleHeaderBell` (Andamento de Obra), não há gate de
 * `profile.role` — qualquer membro da org com acesso ao módulo vê o sino.
 */
export async function TarefasModuleHeaderBell() {
  const supabase = await createSupabaseServerClient();
  const user = await getCachedAuthUser(supabase);
  if (!user) return null;

  const { items, unreadCount } = await getNotificationsForUser(supabase, user.id, {
    limit: 10,
    moduleKey: 'tarefas',
  });

  return (
    <NotificationsBellRealtimeProvider
      userId={user.id}
      initialItems={items}
      initialUnreadCount={unreadCount}
      moduleKey="tarefas"
    >
      <TaskNotificationsBell />
    </NotificationsBellRealtimeProvider>
  );
}
