import { NextResponse, type NextRequest } from 'next/server';
import { buildIdealExportZip } from '@/services/scenarios/buildIdealExportZip';
import { ExportIdealError } from '@/types/exportIdeal';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get('sessionId');

  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId é obrigatório.' }, { status: 400 });
  }

  try {
    const { buffer, filename } = await buildIdealExportZip(sessionId);

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err: unknown) {
    if (err instanceof ExportIdealError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }

    const message =
      err instanceof Error ? err.message : 'Erro ao gerar exportação.';
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
