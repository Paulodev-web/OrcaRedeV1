import { createSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import { publicExecutionPhotoPath } from '@/services/works/workExecutionPhotos';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: {
  params: Promise<{ publicId: string; imageId: string }>;
}) {
  const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
  try {
    const { publicId, imageId } = await params;
    const db = createSupabaseServiceRoleClient();
    const path = await publicExecutionPhotoPath(db, publicId, imageId);
    if (!path) return new Response(null, { status: 404, headers });
    // Mantém o original privado. Remover da galeria corta novas autorizações;
    // um link já emitido expira em, no máximo, 60 segundos.
    const signed = await db.storage.from('andamento-obra').createSignedUrl(path, 60);
    if (signed.error || !signed.data) return new Response(null, { status: 404, headers });
    return new Response(null, { status: 307, headers: { ...headers, Location: signed.data.signedUrl } });
  } catch {
    return new Response(null, { status: 503, headers });
  }
}
