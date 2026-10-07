import { ensureMember } from '@/lib/auth/ensureMember';
import { createSupabaseServiceRoleClient } from '@/lib/supabaseServer';
export const dynamic = 'force-dynamic';
export async function GET(_request: Request, { params }: { params: Promise<{ workId: string; documentId: string }> }) {
  const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
  try {
    const { workId, documentId } = await params;
    const gate = await ensureMember(workId);
    if (!gate.ok || gate.role !== 'engineer') return new Response(null, { status: 404, headers });
    const doc = await gate.supabase.from('crew_documents').select('storage_path,crew_member_id')
      .eq('id', documentId).eq('owner_id', gate.userId).maybeSingle();
    if (doc.error) throw doc.error;
    if (!doc.data) return new Response(null, { status: 404, headers });
    const team = await gate.supabase.from('work_team').select('id').eq('work_id', workId)
      .eq('crew_member_id', doc.data.crew_member_id).is('deallocated_at', null).maybeSingle();
    if (team.error) throw team.error;
    if (!team.data) return new Response(null, { status: 404, headers });
    const signed = await createSupabaseServiceRoleClient().storage.from('crew-documents')
      .createSignedUrl(doc.data.storage_path, 60, { download: true });
    if (signed.error || !signed.data) return new Response(null, { status: 404, headers });
    return new Response(null, { status: 307, headers: { ...headers, Location: signed.data.signedUrl } });
  } catch { return new Response(null, { status: 503, headers }); }
}
