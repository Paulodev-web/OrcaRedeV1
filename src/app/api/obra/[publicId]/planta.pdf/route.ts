import { createSupabaseServiceRoleClient } from '@/lib/supabaseServer';

export const dynamic = 'force-dynamic';
export async function GET(_request: Request, { params }: { params: Promise<{ publicId: string }> }) {
  const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
  try {
    const { publicId } = await params;
    if (publicId.length > 200) return new Response(null, { status: 404, headers });
    const db = createSupabaseServiceRoleClient();
    const portal = await db.from('work_trackings').select('work_id').eq('public_id', publicId)
      .eq('public_enabled', true).is('budget_id', null).maybeSingle();
    if (portal.error) throw portal.error;
    if (!portal.data?.work_id) return new Response(null, { status: 404, headers });
    const workId = portal.data.work_id;
    const work = await db.from('works').select('id').eq('id', workId).neq('status', 'cancelled').maybeSingle();
    if (work.error) throw work.error;
    if (!work.data) return new Response(null, { status: 404, headers });
    const snapshot = await db.from('work_project_snapshot').select('pdf_storage_path').eq('work_id', workId).maybeSingle();
    if (snapshot.error) throw snapshot.error;
    // Só o caminho canônico gravado pela criação de obra independente.
    const path = `${workId}/project/projeto.pdf`;
    if (snapshot.data?.pdf_storage_path !== path) return new Response(null, { status: 404, headers });
    const signed = await db.storage.from('andamento-obra').createSignedUrl(path, 60);
    if (signed.error || !signed.data) return new Response(null, { status: 404, headers });
    return new Response(null, { status: 307, headers: { ...headers, Location: signed.data.signedUrl } });
  } catch {
    return new Response(null, { status: 503, headers });
  }
}
