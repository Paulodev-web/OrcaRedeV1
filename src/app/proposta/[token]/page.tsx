import type { Metadata } from 'next';

import { createSupabasePublicProposalClient } from '@/lib/supabaseServer';
import { loadPublicProposalByToken, toProposalData } from '@/services/proposals/repository';
import { PublicProposalView } from '@/components/proposta-publica/PublicProposalView';
import type { ProposalData } from '@/types/proposal';

/** A peça é pública, mas não é conteúdo para buscador. */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

interface PublicProposalPageProps {
  params: Promise<{ token: string }>;
}

function NotAvailable() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-brand-navy">Proposta indisponível</h1>
        <p className="mt-2 text-sm text-slate-600">
          Este link não está mais ativo ou o endereço está incorreto. Fale com o responsável
          comercial para receber um link atualizado.
        </p>
      </div>
    </main>
  );
}

/**
 * Página pública da proposta.
 *
 * Sem login: quem autoriza é o RLS, comparando o token do endereço com
 * `share_token`. Um token errado — ou uma proposta despublicada ou revogada —
 * não devolve linha, e a resposta é a mesma dos dois casos, para não confirmar
 * a existência de propostas alheias.
 */
export default async function PublicProposalPage({ params }: PublicProposalPageProps) {
  const { token } = await params;

  if (!token || token.length < 16) {
    return <NotAvailable />;
  }

  // Carga e renderização ficam separadas: JSX construído dentro do try daria a
  // falsa impressão de que o catch protege o render, o que não acontece.
  let data: ProposalData | null = null;
  try {
    const supabase = createSupabasePublicProposalClient(token);
    const record = await loadPublicProposalByToken(supabase, token);
    data = record ? toProposalData(record) : null;
  } catch {
    data = null;
  }

  if (!data) {
    return <NotAvailable />;
  }

  return <PublicProposalView data={data} token={token} />;
}
