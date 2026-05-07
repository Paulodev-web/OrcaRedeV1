import { createSupabaseServerClient, requireAuthUserId } from '@/lib/supabaseServer';
import { getWorkTeam } from '@/services/works/getWorkTeam';
import { getWorkAttendanceHistory } from '@/services/works/getWorkAttendanceHistory';
import { WorkTeamSection } from '@/components/andamento-obra/works/equipe/WorkTeamSection';
import { AttendanceTable } from '@/components/andamento-obra/works/equipe/AttendanceTable';

interface Props {
  params: Promise<{ workId: string }>;
}

export async function generateMetadata() {
  return { title: 'Equipe da Obra' };
}

export default async function WorkTeamPage({ params }: Props) {
  const { workId } = await params;
  const supabase = await createSupabaseServerClient();
  const userId = await requireAuthUserId(supabase);

  const [team, attendance, memberRes, crewRes] = await Promise.all([
    getWorkTeam(supabase, workId),
    getWorkAttendanceHistory(supabase, workId),
    supabase
      .from('work_members')
      .select('role')
      .eq('work_id', workId)
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('crew_members')
      .select('id, full_name, role')
      .eq('owner_id', userId)
      .eq('is_active', true)
      .order('full_name', { ascending: true }),
  ]);

  const role = (memberRes.data?.role as string) ?? 'engineer';
  const isEngineer = role === 'engineer';
  const allCrew = (crewRes.data ?? []) as Array<{ id: string; full_name: string; role: string | null }>;
  const allocatedIds = new Set(team.map((t) => t.crewMemberId));
  const availableCrew = allCrew.filter((c) => !allocatedIds.has(c.id));

  return (
    <div className="mx-auto max-w-4xl px-6 py-6 lg:px-8">
      <WorkTeamSection
        team={team}
        availableCrew={availableCrew}
        workId={workId}
        isEngineer={isEngineer}
      />

      <div className="mt-8">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">
          Histórico de Presença
        </h3>
        <AttendanceTable attendance={attendance} team={team} workId={workId} />
      </div>
    </div>
  );
}
