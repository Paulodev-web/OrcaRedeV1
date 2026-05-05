import { notFound, redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { getCurrentUserProfile } from '@/services/people/getCurrentUserProfile';
import { getWorkById } from '@/services/works/getWorkById';
import { getWorkMilestones } from '@/services/works/getWorkMilestones';
import { getWorkProjectPostsCount } from '@/services/works/getWorkProjectPostsCount';
import { getUnreadMessagesCount } from '@/services/works/getUnreadMessagesCount';
import { getUnreadDailyLogsCount } from '@/services/works/getUnreadDailyLogsCount';
import { getPendingMilestonesCount } from '@/services/works/getPendingMilestonesCount';
import { getInstallationsCountByWork } from '@/services/works/getInstallationsCountByWork';
import { getManagers } from '@/services/people/getManagers';
import { WorkHeader } from '@/components/andamento-obra/works/WorkHeader';
import { WorkTabsNav } from '@/components/andamento-obra/works/WorkTabsNav';

interface LayoutProps {
  children: ReactNode;
  params: Promise<{ workId: string }>;
}

export default async function WorkDetailLayout({ children, params }: LayoutProps) {
  const { workId } = await params;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const profile = await getCurrentUserProfile(supabase, user.id);
  if (!profile || profile.role !== 'engineer') redirect('/');

  const work = await getWorkById(supabase, workId);
  if (!work) notFound();

  const [
    milestones,
    managers,
    postsPlanned,
    chatUnread,
    diarioPending,
    progressoPending,
    installationsCounts,
  ] = await Promise.all([
    getWorkMilestones(supabase, workId),
    getManagers(supabase, user.id),
    getWorkProjectPostsCount(supabase, workId),
    getUnreadMessagesCount(supabase, workId, 'engineer'),
    getUnreadDailyLogsCount(supabase, workId),
    getPendingMilestonesCount(supabase, workId),
    getInstallationsCountByWork(supabase, [workId]),
  ]);

  const postsInstalled = installationsCounts[workId]?.installed ?? 0;

  return (
    <div>
      <WorkHeader
        work={work}
        milestones={milestones}
        managers={managers}
        postsPlanned={postsPlanned}
        postsInstalled={postsInstalled}
      />
      <WorkTabsNav
        workId={workId}
        chatUnreadCount={chatUnread}
        diarioPendingCount={diarioPending}
        progressoPendingCount={progressoPending}
      />
      <main className="p-6 lg:p-8">
        <div className="mx-auto max-w-7xl">{children}</div>
      </main>
    </div>
  );
}
