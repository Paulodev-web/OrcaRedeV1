import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { getCurrentUserProfile } from '@/services/people/getCurrentUserProfile';
import { getWorksForEngineer } from '@/services/works/getWorksForEngineer';
import { getNotificationsForUser } from '@/services/notifications/getNotificationsForUser';
import { getUnreadCountsForWorks } from '@/services/works/getUnreadCountsForWorks';
import { getWorkPendingApprovals } from '@/services/works/getWorkPendingApprovals';
import { categorizeWorks } from '@/services/works/categorizeWorks';
import { getManagers } from '@/services/people/getManagers';
import { WorksHomeView } from '@/components/andamento-obra/works/WorksHomeView';
import { PENDING_DAILY_LOG_RED_THRESHOLD_HOURS } from '@/types/works';

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

  const workIds = works.map((w) => w.id);

  const [unreadCounts, pendingApprovals] = await Promise.all([
    getUnreadCountsForWorks(supabase, workIds),
    getWorkPendingApprovals(supabase, workIds),
  ]);

  // Categorizacao:
  //  - red: diario pending_approval ha mais de PENDING_DAILY_LOG_RED_THRESHOLD_HOURS
  //  - yellow: diario pending recente OU marco awaiting_approval
  // Bloco 8 adicionara alertas criticos ao set red.
  const redWorkIds = new Set<string>();
  const yellowWorkIds = new Set<string>();

  for (const item of pendingApprovals.pendingDailyLogs) {
    if (item.hoursWaiting > PENDING_DAILY_LOG_RED_THRESHOLD_HOURS) {
      redWorkIds.add(item.workId);
    } else {
      yellowWorkIds.add(item.workId);
    }
  }
  for (const item of pendingApprovals.pendingMilestones) {
    // Se ja esta em vermelho, mantem; senao classifica como amarelo.
    if (!redWorkIds.has(item.workId)) {
      yellowWorkIds.add(item.workId);
    }
  }

  const grouped = categorizeWorks(works, {
    workIdsWithAlerts: Array.from(redWorkIds),
    workIdsWithPending: Array.from(yellowWorkIds),
  });

  return (
    <main className="p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <WorksHomeView
          grouped={grouped}
          notifications={notifs.items}
          managers={managers}
          hasAnyWork={works.length > 0}
          unreadCountsByWorkId={unreadCounts}
        />
      </div>
    </main>
  );
}
