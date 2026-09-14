import { notFound, redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { createSupabaseServerClient, getCachedAuthUser } from '@/lib/supabaseServer';
import { ensureEngineerProfile } from '@/services/people/ensureEngineerProfile';
import { getWorkById } from '@/services/works/getWorkById';
import { getWorkMilestones } from '@/services/works/getWorkMilestones';
import { getWorkProjectPostsCount } from '@/services/works/getWorkProjectPostsCount';
import { getUnreadMessagesCount } from '@/services/works/getUnreadMessagesCount';
import { getPendingMilestonesCount } from '@/services/works/getPendingMilestonesCount';
import { getWorkOpenAlert } from '@/services/works/getWorkOpenAlert';
import { getWorkExecutionStats } from '@/services/works/getWorkExecutionStats';
import { getInstallationsCountByWork } from '@/services/works/getInstallationsCountByWork';
import { getManagers } from '@/services/people/getManagers';
import { WorkHeader } from '@/components/andamento-obra/works/WorkHeader';
import { WorkTabsNav } from '@/components/andamento-obra/works/WorkTabsNav';
import { WorkAlertBanner } from '@/components/andamento-obra/works/WorkAlertBanner';

interface LayoutProps {
  children: ReactNode;
  params: Promise<{ workId: string }>;
}

export default async function WorkDetailLayout({ children, params }: LayoutProps) {
  const { workId } = await params;

  const supabase = await createSupabaseServerClient();
  const user = await getCachedAuthUser(supabase);
  if (!user) redirect('/');

  const profile = await ensureEngineerProfile(supabase, user.id);
  if (!profile || profile.role !== 'engineer') redirect('/');

  const work = await getWorkById(supabase, workId);
  if (!work) {
    console.error(`[andamento-obra] work not found for id=${workId}, user=${user.id}`);
    notFound();
  }

  const [
    milestones,
    managers,
    postsPlanned,
    chatUnread,
    marcosPending,
    openAlert,
    installationsCounts,
    executionStats,
  ] = await Promise.all([
    getWorkMilestones(supabase, workId),
    getManagers(supabase, user.id),
    getWorkProjectPostsCount(supabase, workId),
    getUnreadMessagesCount(supabase, workId, 'engineer'),
    getPendingMilestonesCount(supabase, workId),
    getWorkOpenAlert(supabase, workId),
    getInstallationsCountByWork(supabase, [workId]),
    getWorkExecutionStats(supabase, [workId]),
  ]);

  const postsInstalled = installationsCounts[workId]?.installed ?? 0;

  return (
    <div>
      {/* Acima do cabecalho de proposito: obra parada nao espera o engenheiro
          navegar ate ela. */}
      <WorkAlertBanner workId={workId} alert={openAlert} />
      <WorkHeader
        work={work}
        milestones={milestones}
        managers={managers}
        postsPlanned={postsPlanned}
        postsInstalled={postsInstalled}
        execution={executionStats[workId] ?? null}
      />
      <WorkTabsNav
        workId={workId}
        chatUnreadCount={chatUnread}
        marcosPendingCount={marcosPending}
      />
      <main className="p-6 lg:p-8">
        <div className="mx-auto max-w-7xl">{children}</div>
      </main>
    </div>
  );
}
