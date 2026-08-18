import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { getQuotationSessionByIdCached } from '@/lib/quotationSessionReads';
import { loadDreContext } from '@/services/dre/loadDreContext';
import { DrePainel } from '@/components/suppliers/dre/DrePainel';
import SuppliesHeader from '@/components/suppliers/SuppliesHeader';
import { suppliesPageColumnClass } from '@/lib/suppliesLayout';
import type { DreContext } from '@/services/dre/loadDreContext';

export const metadata: Metadata = {
  title: 'DRE de Obra — OrcaRede',
  description: 'Orçado × comprado, por grupo, com margem projetada e real.',
};

interface DrePageProps {
  params: Promise<{ sessionId: string }>;
}

/**
 * DRE de Obra vive em Suprimentos e Cotação, não na esteira do orçamento: é
 * aqui que o "comprado" (purchase_orders) nasce, e o "orçado" é só leitura.
 * Igual à aba Cenários (cenarios/page.tsx), resolve o budget_id pela sessão —
 * `work_dre` é por orçamento, não por sessão, mas a navegação é por sessão
 * como o resto do módulo.
 */
export default async function SessionDrePage({ params }: DrePageProps) {
  const { sessionId } = await params;

  const sessionRes = await getQuotationSessionByIdCached(sessionId);
  if (!sessionRes.success) notFound();

  const session = sessionRes.data;

  if (!session.budget_id) {
    return (
      <div className={suppliesPageColumnClass}>
        <SuppliesHeader
          sessionId={sessionId}
          sessionTitle={session.title}
          activeStep="dre"
          hasBudget={false}
          title="DRE de Obra"
          description="Vincule um orçamento a esta sessão para abrir a DRE."
        />
        <div className="rounded-xl border border-dashed border-gray-200 bg-surface p-12 text-center">
          <p className="text-sm text-gray-400">
            Esta sessão não está vinculada a um orçamento — a DRE é sempre de uma obra específica.
          </p>
          <Link
            href={`/fornecedores/sessao/${sessionId}`}
            className="mt-4 inline-block text-sm font-medium text-link transition-colors hover:text-neutral-900 hover:underline"
          >
            ← Voltar para a sessão
          </Link>
        </div>
      </div>
    );
  }

  // Mesma postura de cenarios/conciliacao: falha aqui degrada para "ainda sem
  // DRE", não derruba a aba.
  let context: DreContext | null = null;
  try {
    const supabase = await createSupabaseServerClient();
    context = await loadDreContext(supabase, session.budget_id);
  } catch {
    context = null;
  }

  return (
    <div className={suppliesPageColumnClass}>
      <SuppliesHeader
        sessionId={sessionId}
        sessionTitle={session.title}
        activeStep="dre"
        hasBudget
        title="DRE de Obra"
        description="Orçado × comprado desta obra, por grupo, com margem projetada e real."
      />

      <DrePainel budgetId={session.budget_id} sessionId={sessionId} context={context} />
    </div>
  );
}
