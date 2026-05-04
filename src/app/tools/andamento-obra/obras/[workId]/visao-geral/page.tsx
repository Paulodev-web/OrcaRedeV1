import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { getWorkProjectSnapshot } from '@/services/works/getWorkProjectSnapshot';
import { ProjectOverviewSummary } from '@/components/andamento-obra/works/ProjectOverviewSummary';
import { WorkTabPlaceholder } from '@/components/andamento-obra/works/WorkTabPlaceholder';

interface VisaoGeralPageProps {
  params: Promise<{ workId: string }>;
}

export default async function VisaoGeralPage({ params }: VisaoGeralPageProps) {
  const { workId } = await params;
  const supabase = await createSupabaseServerClient();
  const bundle = await getWorkProjectSnapshot(supabase, workId);

  if (!bundle) {
    return (
      <WorkTabPlaceholder
        title="Visão Geral"
        description="Resumo executivo da obra com snapshot do projeto, marcos e equipe. Em construção."
      />
    );
  }

  return <ProjectOverviewSummary bundle={bundle} />;
}
