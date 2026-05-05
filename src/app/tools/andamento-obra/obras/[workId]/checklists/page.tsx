import { createSupabaseServerClient, requireAuthUserId } from '@/lib/supabaseServer';
import { getWorkChecklists } from '@/services/works/getWorkChecklists';
import { getChecklistTemplates } from '@/services/works/getChecklistTemplates';
import { ChecklistsList } from '@/components/andamento-obra/works/checklists/ChecklistsList';
import { AssignChecklistDialog } from '@/components/andamento-obra/works/checklists/AssignChecklistDialog';

interface Props {
  params: Promise<{ workId: string }>;
}

export async function generateMetadata() {
  return { title: 'Checklists da Obra' };
}

export default async function WorkChecklistsPage({ params }: Props) {
  const { workId } = await params;
  const supabase = await createSupabaseServerClient();
  const userId = await requireAuthUserId(supabase);

  const [checklists, templates, memberRes] = await Promise.all([
    getWorkChecklists(supabase, workId),
    getChecklistTemplates(supabase, userId),
    supabase
      .from('work_members')
      .select('role')
      .eq('work_id', workId)
      .eq('user_id', userId)
      .maybeSingle(),
  ]);

  const role = (memberRes.data?.role as string) ?? 'engineer';
  const isEngineer = role === 'engineer';

  return (
    <div className="mx-auto max-w-4xl px-6 py-6 lg:px-8">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[#1D3140]">Checklists</h2>
        {isEngineer && (
          <AssignChecklistDialog workId={workId} templates={templates} />
        )}
      </div>

      <ChecklistsList checklists={checklists} workId={workId} role={role} />
    </div>
  );
}
