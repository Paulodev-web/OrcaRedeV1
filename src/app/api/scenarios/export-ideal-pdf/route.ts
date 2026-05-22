import { NextResponse, type NextRequest } from 'next/server';
import { buildIdealExportPdf } from '@/services/scenarios/buildIdealExportPdf';
import { ExportIdealError } from '@/types/exportIdeal';
import { PdfTemplateError } from '@/types/pdfExport';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get('sessionId');
  const supplierSlug = request.nextUrl.searchParams.get('supplierSlug');

  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId é obrigatório.' }, { status: 400 });
  }
  if (!supplierSlug) {
    return NextResponse.json({ error: 'supplierSlug é obrigatório.' }, { status: 400 });
  }

  try {
    const { buffer, filename } = await buildIdealExportPdf(sessionId, supplierSlug);

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err: unknown) {
    if (err instanceof ExportIdealError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof PdfTemplateError) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }

    const message =
      err instanceof Error ? err.message : 'Erro ao gerar PDF.';
    const isAuth =
      message.includes('Unauthorized') ||
      message.includes('não autenticado') ||
      message.includes('autenticado');

    return NextResponse.json(
      { error: message },
      { status: isAuth ? 401 : 500 }
    );
  }
}
