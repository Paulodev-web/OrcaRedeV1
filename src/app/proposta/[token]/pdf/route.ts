import { NextResponse, type NextRequest } from 'next/server';

import { createSupabasePublicProposalClient } from '@/lib/supabaseServer';
import { ProposalValidationError, renderProposalPdf } from '@/services/pdf/proposal';
import { loadPublicProposalByToken, toProposalData } from '@/services/proposals/repository';

/**
 * Download do PDF pelo link público.
 *
 * Autorização é o token, exatamente como na página: o cliente anônimo apresenta
 * `x-proposal-token` e o RLS compara. Nenhum registro é alcançável sem o token
 * certo, e proposta despublicada ou revogada não devolve linha.
 *
 * Diferente da rota interna, aqui `allowPlaceholders` é sempre `false` — o
 * cliente nunca deve receber uma peça com texto de template por preencher, que
 * foi como o "TEXTO DO SEU PARÁGRAFO" chegou ao cliente na proposta da Maxif4.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  if (!token || token.length < 16) {
    return NextResponse.json({ error: 'Proposta indisponível.' }, { status: 404 });
  }

  const supabase = createSupabasePublicProposalClient(token);
  const record = await loadPublicProposalByToken(supabase, token);

  // Mesma resposta para token errado, proposta despublicada e link revogado:
  // não confirmar a existência de propostas alheias.
  if (!record) {
    return NextResponse.json({ error: 'Proposta indisponível.' }, { status: 404 });
  }

  try {
    const pdf = await renderProposalPdf(toProposalData(record), { allowPlaceholders: false });

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${buildFileName(
          record.proposal.proposalNumber,
          record.proposal.version,
          record.proposal.clientName,
        )}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    // Detalhe de validação é assunto interno; para o cliente é indisponibilidade.
    if (error instanceof ProposalValidationError) {
      return NextResponse.json({ error: 'Proposta indisponível.' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Não foi possível gerar o PDF.' }, { status: 500 });
  }
}

function buildFileName(proposalNumber: number, version: number, clientName: string): string {
  const client = clientName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);

  return `${proposalNumber}.${version}${client ? `_${client}` : ''}.pdf`;
}
