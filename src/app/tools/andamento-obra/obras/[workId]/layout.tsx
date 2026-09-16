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
import { ensureOrgAdmin } from '@/lib/auth/ensureOrgAdmin';
import { ClipboardList } from 'lucide-react';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { ModuleHeaderBell } from '@/components/andamento-obra/ModuleHeaderBell';
import { WorkHeaderActions } from '@/components/andamento-obra/works/WorkHeaderActions';
import { WorkHeaderMeta } from '@/components/andamento-obra/works/WorkHeaderMeta';
import { WorkKPIs } from '@/components/andamento-obra/works/WorkKPIs';
import { ImportedBudgetBadge } from '@/components/andamento-obra/works/ImportedBudgetBadge';
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
    postsPlanned,
    chatUnread,
    marcosPending,
    openAlert,
    installationsCounts,
    executionStats,
    orgAdminGate,
  ] = await Promise.all([
    getWorkMilestones(supabase, workId),
    getWorkProjectPostsCount(supabase, workId),
    getUnreadMessagesCount(supabase, workId, 'engineer'),
    getPendingMilestonesCount(supabase, workId),
    getWorkOpenAlert(supabase, workId),
    getInstallationsCountByWork(supabase, [workId]),
    getWorkExecutionStats(supabase, [workId]),
    ensureOrgAdmin(),
  ]);
  const canManageOrg = orgAdminGate.ok;

  const postsInstalled = installationsCounts[workId]?.installed ?? 0;

  return (
    <div>
      {/* Acima do cabecalho de proposito: obra parada nao espera o engenheiro
          navegar ate ela. */}
      <WorkAlertBanner workId={workId} alert={openAlert} />
      {/* Um cabecalho so, o do sistema. Antes havia dois empilhados: o do
          modulo, vindo do layout de cima, e um `WorkHeader` proprio da obra,
          cada um com a sua trilha. O `AndamentoObraChrome` esconde o dele
          quando a rota e a de uma obra, e este toma o lugar. */}
      <ModuleHeader
        icon={ClipboardList}
        title={
          <span className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="truncate">{work.name}</span>
            {work.budgetId && <ImportedBudgetBadge />}
          </span>
        }
        description={<WorkHeaderMeta work={work} />}
        breadcrumb={[
          // A raiz do modulo ja e a lista de obras, entao nao existe um nivel
          // "Obras" separado para apontar: seriam dois itens com o mesmo href.
          { label: 'Andamento de Obra', href: '/tools/andamento-obra' },
          { label: work.name },
        ]}
        actions={
          <>
            <WorkHeaderActions workId={work.id} status={work.status} />
            {/* O sino vinha do cabecalho do modulo, que aqui nao e renderizado.
                Sem isto o engenheiro perderia as notificacoes justamente na
                tela onde passa mais tempo. */}
            <ModuleHeaderBell />
          </>
        }
        extra={
          <WorkKPIs
            work={work}
            milestones={milestones}
            postsPlanned={postsPlanned}
            postsInstalled={postsInstalled}
            execution={executionStats[workId] ?? null}
          />
        }
        tabs={
          <WorkTabsNav
            workId={workId}
            chatUnreadCount={chatUnread}
            marcosPendingCount={marcosPending}
            canManageOrg={canManageOrg}
          />
        }
      />
      <main className="p-6 lg:p-8">
        <div className="mx-auto max-w-7xl">{children}</div>
      </main>
    </div>
  );
}
