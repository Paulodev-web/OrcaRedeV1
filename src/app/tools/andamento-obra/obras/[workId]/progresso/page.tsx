import { notFound, redirect } from 'next/navigation';
import { createSupabaseServerClient, requireAuthUserId } from '@/lib/supabaseServer';
import { getCurrentUserProfile } from '@/services/people/getCurrentUserProfile';
import { getWorkById } from '@/services/works/getWorkById';
import { getWorkProgressData } from '@/services/works/getWorkProgressData';
import { getWorkMilestonesWithEvents } from '@/services/works/getWorkMilestonesWithEvents';
import { ProgressOverview } from '@/components/andamento-obra/works/progresso/ProgressOverview';
import { MilestonesList } from '@/components/andamento-obra/works/progresso/MilestonesList';
import type { WorkMemberRole } from '@/types/works';

interface ProgressoPageProps {
  params: Promise<{ workId: string }>;
}

export default async function ProgressoPage({ params }: ProgressoPageProps) {
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

  const [progressData, milestones] = await Promise.all([
    getWorkProgressData(supabase, workId),
    getWorkMilestonesWithEvents(supabase, workId),
  ]);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold text-[#1D3140]">Progresso da obra</h1>
        <p className="text-xs text-gray-500">
          Métricas planejado vs realizado, marcos da obra e evolução temporal.
        </p>
      </header>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <ProgressOverview data={progressData} />
        </div>
        <div className="lg:col-span-2">
          <MilestonesList
            workId={workId}
            workStatus={work.status}
            viewerRole={viewerRole}
            initialMilestones={milestones}
          />
        </div>
      </div>
    </div>
  );
}
