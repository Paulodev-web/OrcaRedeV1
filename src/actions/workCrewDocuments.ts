'use server';

import { revalidatePath } from 'next/cache';
import { ensureMember } from '@/lib/auth/ensureMember';
import { createSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import type { ActionResult } from '@/types/works';
import { PDFDocument } from 'pdf-lib';

export async function uploadCrewDocument(form: FormData): Promise<ActionResult> {
  const workId = String(form.get('workId') ?? '');
  const crewId = String(form.get('crewMemberId') ?? '');
  const title = String(form.get('title') ?? '').trim();
  const kind = String(form.get('kind') ?? '');
  const file = form.get('file');
  const gate = await ensureMember(workId);
  if (!gate.ok) return { success: false, error: gate.error };
  if (gate.role !== 'engineer') return { success: false, error: 'Somente o engenheiro gerencia documentos.' };
  if (!title || title.length > 120 || !['NR','CNH','OTHER'].includes(kind)) return { success: false, error: 'Informe título e tipo válidos.' };
  if (!(file instanceof File) || file.size < 1 || file.size > 8 * 1024 * 1024) return { success: false, error: 'Envie um PDF, JPG ou PNG de até 8 MB.' };
  const membership = await gate.supabase.from('work_team').select('crew_member_id,crew_members!inner(owner_id,is_active)')
    .eq('work_id', workId).eq('crew_member_id', crewId).is('deallocated_at', null)
    .eq('crew_members.owner_id', gate.userId).eq('crew_members.is_active', true).maybeSingle();
  if (membership.error || !membership.data) return { success: false, error: 'Pessoa não disponível na equipe desta obra.' };
  const bytes = new Uint8Array(await file.arrayBuffer());
  let ext: string;
  let mime: string;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) { ext = 'jpg'; mime = 'image/jpeg'; }
  else if ([137,80,78,71,13,10,26,10].every((byte, i) => bytes[i] === byte)) { ext = 'png'; mime = 'image/png'; }
  else {
    try { const pdf = await PDFDocument.load(bytes, { updateMetadata: false }); if (!pdf.getPageCount()) throw new Error(); }
    catch { return { success: false, error: 'Arquivo inválido. Use PDF sem senha, JPG ou PNG.' }; }
    ext = 'pdf'; mime = 'application/pdf';
  }
  const id = crypto.randomUUID();
  const path = `${gate.userId}/${crewId}/${id}.${ext}`;
  const admin = createSupabaseServiceRoleClient();
  const upload = await admin.storage.from('crew-documents').upload(path, bytes, { contentType: mime, upsert: false });
  if (upload.error) return { success: false, error: 'Falha ao enviar documento.' };
  const saved = await gate.supabase.from('crew_documents').insert({
    id, owner_id: gate.userId, crew_member_id: crewId, title, document_kind: kind,
    storage_path: path, mime_type: mime, size_bytes: bytes.length,
  });
  if (saved.error) {
    await admin.storage.from('crew-documents').remove([path]);
    return { success: false, error: 'Não foi possível salvar o documento.' };
  }
  revalidatePath(`/tools/andamento-obra/obras/${workId}/equipe`);
  return { success: true };
}

export async function setCrewDocumentPublication(workId: string, documentId: string, published: boolean): Promise<ActionResult> {
  const gate = await ensureMember(workId);
  if (!gate.ok) return { success: false, error: gate.error };
  if (gate.role !== 'engineer') return { success: false, error: 'Somente o engenheiro escolhe os documentos do cliente.' };
  const query = published
    ? gate.supabase.from('work_document_publications').upsert({ work_id: workId, document_id: documentId, published_by: gate.userId }, { onConflict: 'work_id,document_id', ignoreDuplicates: true })
    : gate.supabase.from('work_document_publications').delete().eq('work_id', workId).eq('document_id', documentId);
  const result = await query;
  if (result.error) return { success: false, error: 'Não foi possível alterar a publicação. Confira a alocação na equipe.' };
  revalidatePath(`/tools/andamento-obra/obras/${workId}/equipe`);
  return { success: true };
}
