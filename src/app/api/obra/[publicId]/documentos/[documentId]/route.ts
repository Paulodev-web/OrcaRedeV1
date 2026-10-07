import { createSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import { getPublicCrewDocuments } from '@/services/works/getCrewDocuments';
export const dynamic = 'force-dynamic';
export async function GET(_request: Request, { params }: { params: Promise<{ publicId: string; documentId: string }> }) {
  const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
  try {
    const { publicId, documentId } = await params;
    const db = createSupabaseServiceRoleClient();
    const documents = await getPublicCrewDocuments(db, publicId);
    const document = documents.find((item) => item.id === documentId);
    if (!document) return new Response(null, { status: 404, headers });
    const signed = await db.storage.from('crew-documents').createSignedUrl(document.path, 60, { download: true });
    if (signed.error || !signed.data) return new Response(null, { status: 404, headers });
    return new Response(null, { status: 307, headers: { ...headers, Location: signed.data.signedUrl } });
  } catch { return new Response(null, { status: 503, headers }); }
}
