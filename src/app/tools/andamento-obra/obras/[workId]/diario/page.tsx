import { notFound, redirect } from 'next/navigation';
import { createSupabaseServerClient, requireAuthUserId } from '@/lib/supabaseServer';
import { ensureEngineerProfile } from '@/services/people/ensureEngineerProfile';
import { getWorkById } from '@/services/works/getWorkById';
import { getViewerWorkRole } from '@/services/works/getViewerWorkRole';
import { getWorkDailyLogs } from '@/services/works/getWorkDailyLogs';
import { getDailyLogSignedUrls } from '@/services/works/getDailyLogSignedUrls';
import { DailyLogList } from '@/components/andamento-obra/works/diario/DailyLogList';

interface DiarioPageProps {
  params: Promise<{ workId: string }>;
}

export default async function DiarioPage({ params }: DiarioPageProps) {
  const { workId } = await params;

  const supabase = await createSupabaseServerClient();
  let userId: string;
  try {
    userId = await requireAuthUserId(supabase);
  } catch {
    redirect('/');
  }

  const profile = await ensureEngineerProfile(supabase, userId);
  if (!profile || profile.role !== 'engineer') {
    redirect('/');
  }

  const [viewerRole, work] = await Promise.all([
    getViewerWorkRole(supabase, workId, userId),
    getWorkById(supabase, workId),
  ]);

  if (!viewerRole || !work) {
    notFound();
  }

  const { items, hasMore } = await getWorkDailyLogs(supabase, workId);
  const paths = items.flatMap((log) =>
    log.currentRevision ? log.currentRevision.media.map((m) => m.storagePath) : [],
  );
  const signedUrls = await getDailyLogSignedUrls(paths);

  return (
    <DailyLogList
      workId={workId}
      workStatus={work.status}
      viewerRole={viewerRole}
      initialItems={items}
      initialHasMore={hasMore}
      initialSignedUrls={signedUrls}
    />
  );
}
