import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { getCurrentUserProfile } from '@/services/people/getCurrentUserProfile';
import { getNotificationsForUser } from '@/services/notifications/getNotificationsForUser';
import { NotificationsFullList } from './NotificationsFullList';

export const metadata: Metadata = {
  title: 'Notificações — Andamento de Obra',
  description: 'Todas as notificações do módulo Andamento de Obra.',
};

export default async function NotificacoesPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/');

  const profile = await getCurrentUserProfile(supabase, user.id);
  if (!profile || profile.role !== 'engineer') redirect('/');

  const { items, unreadCount } = await getNotificationsForUser(supabase, user.id, { limit: 30 });
  const hasMore = items.length >= 30;

  return (
    <main className="p-6 lg:p-8">
      <div className="mx-auto max-w-3xl">
        <header className="mb-6">
          <h1 className="text-xl font-bold text-[#1D3140]">Notificações</h1>
          <p className="mt-1 text-xs text-gray-500">
            {unreadCount > 0
              ? `${unreadCount} não ${unreadCount === 1 ? 'lida' : 'lidas'}`
              : 'Todas lidas'}
          </p>
        </header>
        <NotificationsFullList initialItems={items} initialHasMore={hasMore} />
      </div>
    </main>
  );
}
