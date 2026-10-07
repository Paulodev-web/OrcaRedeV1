import { createSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import { getPublicCrewDocuments } from '@/services/works/getCrewDocuments';
export const dynamic = 'force-dynamic';
export async function GET(_request: Request, { params }: { params: Promise<{ publicId: string }> }) {
  const headers = { 'Cache-Control': 'private, no-store' };
  try {
    const { publicId } = await params;
    const documents = await getPublicCrewDocuments(createSupabaseServiceRoleClient(), publicId);
    return Response.json(documents.map(({ id, title, kind, memberName }) => ({ id, title, kind, memberName })), { headers });
  } catch { return Response.json({ error: 'Documentos indisponíveis.' }, { status: 503, headers }); }
}
