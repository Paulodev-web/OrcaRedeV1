import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient, requireAuthUserId } from '@/lib/supabaseServer';
import { renderPdfFromTemplate } from '@/services/pdf/renderPdfFromTemplate';
import { validateGeneratePdfRequest } from '@/services/pdf/validateGeneratePdfRequest';
import { PdfTemplateError } from '@/types/pdfExport';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  // Renderizar PDF é trabalho de CPU no servidor: exige sessão válida antes de
  // qualquer parse de body. O único consumidor é o formulário em /tools/gerador-pdf,
  // que chama do browser e portanto já envia o cookie de sessão.
  // (O export de cenário ideal não passa por aqui — usa renderPdfFromTemplate direto.)
  const supabase = await createSupabaseServerClient();
  try {
    await requireAuthUserId(supabase);
  } catch {
    return NextResponse.json({ error: 'Usuário não autenticado.' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 });
  }

  const validated = validateGeneratePdfRequest(body);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  try {
    const pdfBytes = await renderPdfFromTemplate(validated.data);
    return new Response(new Uint8Array(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="documento.pdf"',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err: unknown) {
    if (err instanceof PdfTemplateError) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
    const message = err instanceof Error ? err.message : 'Erro ao gerar PDF.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
