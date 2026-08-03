import type { Metadata } from 'next';
import Link from 'next/link';

import { createSupabaseServerClient, requireAuthUserId } from '@/lib/supabaseServer';
import { listProposals, type ProposalListItem } from '@/services/proposals/repository';
import { ProposalsListClient } from '@/components/propostas/ProposalsListClient';

export const metadata: Metadata = {
  title: 'Propostas comerciais — OrcaRede',
  description: 'Propostas geradas a partir dos orçamentos, com status e link público.',
};

export default async function PropostasPage() {
  let proposals: ProposalListItem[] = [];
  let error: string | null = null;

  try {
    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);
    proposals = await listProposals(supabase, userId);
  } catch (err) {
    error = err instanceof Error ? err.message : 'Não foi possível carregar as propostas.';
  }

  if (error) {
    return (
      <main className="min-h-screen bg-brand-surface p-6 lg:p-8">
        <div className="mx-auto max-w-3xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-semibold text-brand-navy">Propostas comerciais</h1>
          <p className="mt-2 text-sm text-slate-600">{error}</p>
          <Link href="/" className="mt-4 inline-flex text-sm font-medium text-brand-blue hover:brightness-95">
            Ir para o portal
          </Link>
        </div>
      </main>
    );
  }

  return <ProposalsListClient proposals={proposals} />;
}
