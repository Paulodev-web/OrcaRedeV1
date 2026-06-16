import { NextResponse, type NextRequest } from 'next/server';
import { listIdealExportSuppliers } from '@/services/scenarios/buildIdealExportPdf';
import { ExportIdealError } from '@/types/exportIdeal';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get('sessionId');

  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId é obrigatório.' }, { status: 400 });
  }

  try {
    const suppliers = await listIdealExportSuppliers(sessionId);
    return NextResponse.json({ suppliers });
  } catch (err: unknown) {
    if (err instanceof ExportIdealError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }

    const message =
      err instanceof Error ? err.message : 'Erro ao listar fornecedores.';
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
