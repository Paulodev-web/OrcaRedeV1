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
  //  - red: diario pending >24h OU alertas critical em open/in_progress
  //         OU resolved_in_field aguardando >12h
  //  - yellow: diario pending <24h OU marco awaiting_approval
  //            OU checklists awaiting/returned OU alertas nao-criticos ativos
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
    if (!redWorkIds.has(item.workId)) {
      yellowWorkIds.add(item.workId);
    }
  }
  for (const item of pendingApprovals.activeAlerts) {
    const work = works.find((w) => w.id === item.workId);
    if (work?.status === 'cancelled') continue;
    if (item.criticalCount > 0) {
      redWorkIds.add(item.workId);
    } else if (item.totalActiveCount > 0) {
      if (!redWorkIds.has(item.workId)) yellowWorkIds.add(item.workId);
    }
  }
  for (const item of pendingApprovals.pendingChecklists) {
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
