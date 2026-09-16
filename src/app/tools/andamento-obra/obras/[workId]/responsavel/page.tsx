import { notFound, redirect } from 'next/navigation';
import { createSupabaseServerClient, requireAuthUserId } from '@/lib/supabaseServer';
import { ensureEngineerProfile } from '@/services/people/ensureEngineerProfile';
import { ensureOrgAdmin } from '@/lib/auth/ensureOrgAdmin';
import { getWorkById } from '@/services/works/getWorkById';
import { getOrgEngineers } from '@/services/people/getOrgEngineers';
import { getManagers } from '@/services/people/getManagers';
import { WorkEngineerAssignment } from '@/components/andamento-obra/works/WorkEngineerAssignment';
import { WorkManagerAssignment } from '@/components/andamento-obra/works/WorkManagerAssignment';

interface ResponsavelPageProps {
  params: Promise<{ workId: string }>;
}

export async function generateMetadata() {
  return { title: 'Responsável pela Obra' };
}

/**
 * Aba que só serve a quem administra a organização: trocar o engenheiro
 * responsável (reassignWorkEngineerAction) e o gerente de obra
 * (reassignWorkManagerAction) da obra. Fora do WorkTabsNav padrão — só entra
 * no menu pra quem pode usá-la (ver layout.tsx) — mas a rota fica de pé e
 * legível em modo leitura pra quem acessar o link direto, o mesmo tratamento
 * que `equipe`/`checklists` já recebem nesse módulo.
 */
export default async function ResponsavelPage({ params }: ResponsavelPageProps) {
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

  const work = await getWorkById(supabase, workId);
  if (!work) notFound();

  const adminGate = await ensureOrgAdmin();
  const canManage = adminGate.ok;
  const [engineers, managers] = canManage
    ? await Promise.all([
        getOrgEngineers(adminGate.supabase, adminGate.orgId),
        getManagers(adminGate.supabase, work.engineerId),
      ])
    : [[], []];

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-6 py-6 lg:px-8">
      <WorkEngineerAssignment
        workId={work.id}
        currentEngineerId={work.engineerId}
        currentEngineerName={work.engineerName}
        engineers={engineers}
        canManage={canManage}
      />
      <WorkManagerAssignment
        workId={work.id}
        currentManagerId={work.managerId}
        currentManagerName={work.managerName}
        managers={managers}
        canManage={canManage}
      />
    </div>
  );
}
