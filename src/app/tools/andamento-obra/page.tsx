import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { getCurrentUserProfile } from '@/services/people/getCurrentUserProfile';
import { getWorksForEngineer } from '@/services/works/getWorksForEngineer';
import { getNotificationsForUser } from '@/services/notifications/getNotificationsForUser';
import { categorizeWorks } from '@/services/works/categorizeWorks';
import { getManagers } from '@/services/people/getManagers';
import { WorksHomeView } from '@/components/andamento-obra/works/WorksHomeView';

export const metadata: Metadata = {
  title: 'Andamento de Obra — OrcaRede',
  description: 'Central de Acompanhamento e Notificações das obras em campo.',
};

export default async function AndamentoObraPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/');
  }

  const profile = await getCurrentUserProfile(supabase, user.id);
  if (!profile || profile.role !== 'engineer') {
    redirect('/');
  }

  const [works, notifs, managers] = await Promise.all([
    getWorksForEngineer(supabase, user.id),
    getNotificationsForUser(supabase, user.id, { limit: 30 }),
    getManagers(supabase, user.id),
  ]);

  const grouped = categorizeWorks(works);

  return (
    <main className="p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <WorksHomeView
          grouped={grouped}
          notifications={notifs.items}
          managers={managers}
          hasAnyWork={works.length > 0}
        />
      </div>
    </main>
  );
}
