import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient, getCachedAuthUser } from '@/lib/supabaseServer';
import { ensureEngineerProfile } from '@/services/people/ensureEngineerProfile';
import { getWorksForEngineer } from '@/services/works/getWorksForEngineer';
import { getNotificationsForUser } from '@/services/notifications/getNotificationsForUser';
import { getUnreadCountsForWorks } from '@/services/works/getUnreadCountsForWorks';
import { getWorkPendingApprovals } from '@/services/works/getWorkPendingApprovals';
import { categorizeWorks } from '@/services/works/categorizeWorks';
import { getManagers } from '@/services/people/getManagers';
import { WorksHomeView } from '@/components/andamento-obra/works/WorksHomeView';
import { getWorkExecutionStats } from '@/services/works/getWorkExecutionStats';
import type { WorkImpedimentCounts } from '@/components/andamento-obra/works/AcompanhamentoCenter';

export const metadata: Metadata = {
  title: 'Andamento de Obra — OrcaRede',
  description: 'Central de Acompanhamento e Notificações das obras em campo.',
};

export default async function AndamentoObraPage() {
  const supabase = await createSupabaseServerClient();
  const user = await getCachedAuthUser(supabase);

  if (!user) {
    redirect('/');
  }

  const profile = await ensureEngineerProfile(supabase, user.id);
  if (!profile || profile.role !== 'engineer') {
    redirect('/');
  }

  const [works, notifs, managers] = await Promise.all([
    getWorksForEngineer(supabase, user.id),
    getNotificationsForUser(supabase, user.id, { limit: 30 }),
    getManagers(supabase, user.id),
  ]);

  const workIds = works.map((w) => w.id);

  const [unreadCounts, sinais, executionStats] = await Promise.all([
    getUnreadCountsForWorks(supabase, workIds),
    getWorkPendingApprovals(supabase, workIds),
    getWorkExecutionStats(supabase, workIds),
  ]);

  // Duas coisas tiram uma obra do "andamento normal", e as duas sao decisao do
  // engenheiro:
  //
  //  - vermelho: impedimento grave (`critical` ou `high`) ainda em aberto. A
  //    obra parou e a decisao e agora.
  //  - amarelo:  marco esperando aprovacao, impedimento leve, ou impedimento ja
  //    resolvido em campo esperando o encerramento formal.
  //
  // O que saiu: diario `pending_approval` e checklist `awaiting_validation`.
  // Nao e que estejam vazios hoje; e que deixaram de existir como fluxo.
  const redWorkIds = new Set<string>();
  const yellowWorkIds = new Set<string>();

  // Os selos do cartao reaproveitam a mesma leitura em batch da categorizacao.
  // Nenhuma consulta a mais por obra.
  const impedimentCountsByWorkId: Record<string, WorkImpedimentCounts> = {};

  for (const item of sinais.pendingMilestones) {
    yellowWorkIds.add(item.workId);
  }

  for (const item of sinais.activeAlerts) {
    const work = works.find((w) => w.id === item.workId);
    // Obra cancelada nao acende faixa; o selo segue a mesma regra para o cartao
    // nao contradizer o grupo em que ele aparece.
    if (work?.status === 'cancelled') continue;

    impedimentCountsByWorkId[item.workId] = {
      graves: item.gravesCount,
      ativos: item.totalActiveCount,
      resolvidos: item.resolvidosCount,
    };

    if (item.gravesCount > 0) {
      redWorkIds.add(item.workId);
      yellowWorkIds.delete(item.workId);
    } else if (item.totalActiveCount > 0 && !redWorkIds.has(item.workId)) {
      yellowWorkIds.add(item.workId);
    }
  }

  // Silencio nao entra na categorizacao: nao e uma decisao esperando o
  // engenheiro, e uma observacao. Ela aparece no proprio cartao, dentro do
  // grupo onde a obra ja estava.
  const lastRecordByWorkId: Record<string, string | null> = {};
  for (const id of workIds) {
    lastRecordByWorkId[id] = executionStats[id]?.lastRecordAt ?? null;
  }

  const grouped = categorizeWorks(works, {
    workIdsWithAlerts: Array.from(redWorkIds),
    workIdsWithPending: Array.from(yellowWorkIds),
  });

  return (
    <main className="p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <WorksHomeView
          grouped={grouped}
          notifications={notifs.items}
          managers={managers}
          hasAnyWork={works.length > 0}
          unreadCountsByWorkId={unreadCounts}
          impedimentCountsByWorkId={impedimentCountsByWorkId}
          lastRecordByWorkId={lastRecordByWorkId}
        />
      </div>
    </main>
  );
}
