import { NextResponse, type NextRequest } from 'next/server';

import { createSupabaseServerClient, requireAuthUserId } from '@/lib/supabaseServer';
import { getModuleAccess } from '@/lib/auth/moduleAccess';
import {
  ProposalValidationError,
  renderProposalPdf,
} from '@/services/pdf/proposal';
import { loadProposalRecord, toProposalData } from '@/services/proposals/repository';

/**
 * Download do PDF da proposta pelo painel interno.
 *
 * AUTENTICADA — ao contrário de `/api/generate-pdf`, cuja falta de autenticação
 * a Fase 0 foi corrigir. Aqui a sessão é exigida e o registro só é carregado
 * pelo par (usuário, proposta).
 *
 * Runtime Node: `@react-pdf/renderer` desenha no servidor, sem navegador — é o
 * que mantém a geração dentro dos 60s do plano Hobby.
 *
 * Rascunho tolera placeholder de template (é rascunho); proposta publicada não.
 * A coerência NUMÉRICA é exigida nos dois casos: um PDF com a curva ABC que não
 * fecha não deve existir nem para conferência interna.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let userId: string;
  const supabase = await createSupabaseServerClient();

  try {
    userId = await requireAuthUserId(supabase);
  } catch {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }

  // Route Handlers não passam por `layout.tsx` — `/propostas/layout.tsx` não
  // cobre esta rota, então a checagem de módulo precisa ser explícita aqui.
  const access = await getModuleAccess();
  if (!access.isOrgAdmin && !access.canView.has('propostas')) {
    return NextResponse.json({ error: 'Sem acesso a este módulo.' }, { status: 403 });
  }

  const record = await loadProposalRecord(supabase, userId, id);
  if (!record) {
    return NextResponse.json({ error: 'Proposta não encontrada.' }, { status: 404 });
  }

  const data = toProposalData(record);
  const isDraft = record.proposal.status !== 'published';

  try {
    const pdf = await renderProposalPdf(data, { allowPlaceholders: isDraft });
    const fileName = buildFileName(record.proposal.proposalNumber, record.proposal.version, record.proposal.clientName);

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${fileName}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    if (error instanceof ProposalValidationError) {
      return NextResponse.json(
        {
          error: 'A proposta não passou na validação de coerência.',
          issues: error.issues,
        },
        { status: 422 },
      );
    }

    const message = error instanceof Error ? error.message : 'Falha ao gerar o PDF.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function buildFileName(proposalNumber: number, version: number, clientName: string): string {
  const client = clientName
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);

  return `${proposalNumber}.${version}${client ? `_${client}` : ''}.pdf`;
}
