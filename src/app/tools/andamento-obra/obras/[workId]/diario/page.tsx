import { notFound, redirect } from 'next/navigation';
import { createSupabaseServerClient, requireAuthUserId } from '@/lib/supabaseServer';
import { getCurrentUserProfile } from '@/services/people/getCurrentUserProfile';
import { getWorkById } from '@/services/works/getWorkById';
import { getWorkDailyLogs } from '@/services/works/getWorkDailyLogs';
import { getDailyLogSignedUrls } from '@/services/works/getDailyLogSignedUrls';
import { DailyLogList } from '@/components/andamento-obra/works/diario/DailyLogList';
import type { WorkMemberRole } from '@/types/works';

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

  const profile = await getCurrentUserProfile(supabase, userId);
  if (!profile || profile.role !== 'engineer') {
    redirect('/');
  }

  const { data: memberRow } = await supabase
    .from('work_members')
    .select('role')
    .eq('work_id', workId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!memberRow) {
    notFound();
  }
  const viewerRole = memberRow.role as WorkMemberRole;

  const work = await getWorkById(supabase, workId);
  if (!work) {
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
