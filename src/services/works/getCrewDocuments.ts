import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface CrewDocument {
  id: string;
  crewMemberId: string;
  title: string;
  kind: string;
  published: boolean;
}

export async function getCrewDocuments(db: SupabaseClient, workId: string, crewIds: string[]): Promise<CrewDocument[]> {
  if (crewIds.length === 0) return [];
  const [documents, shares] = await Promise.all([
    db.from('crew_documents').select('id,crew_member_id,title,document_kind').in('crew_member_id', crewIds).order('created_at', { ascending: false }),
    db.from('work_document_publications').select('document_id').eq('work_id', workId),
  ]);
  if (documents.error || shares.error) throw new Error('Não foi possível carregar os documentos da equipe.');
  const published = new Set(shares.data.map((share) => share.document_id));
  return documents.data.map((doc) => ({ id: doc.id, crewMemberId: doc.crew_member_id, title: doc.title, kind: doc.document_kind, published: published.has(doc.id) }));
}

/** Serviço privilegiado exclusivo das rotas públicas por token. Não retorna dados de membro não alocado. */
export async function getPublicCrewDocuments(db: SupabaseClient, publicId: string) {
  if (publicId.length > 200) return [];
  const portal = await db.from('work_trackings').select('work_id').eq('public_id', publicId).eq('public_enabled', true).maybeSingle();
  if (portal.error) throw portal.error;
  if (!portal.data?.work_id) return [];
  const workId = portal.data.work_id;
  const work = await db.from('works').select('id').eq('id', workId).neq('status', 'cancelled').maybeSingle();
  if (work.error) throw work.error;
  if (!work.data) return [];
  const [team, shares] = await Promise.all([
    db.from('work_team').select('crew_member_id,crew_members!inner(full_name,is_active,owner_id)')
      .eq('work_id', workId).is('deallocated_at', null).eq('crew_members.is_active', true),
    db.from('work_document_publications').select('document_id,published_by,crew_documents!inner(id,crew_member_id,owner_id,title,document_kind,storage_path,mime_type)')
      .eq('work_id', workId),
  ]);
  if (team.error || shares.error) throw new Error('Falha ao carregar documentos públicos.');
  type Member = { crew_member_id: string; crew_members: { full_name: string; owner_id: string } };
  type Share = { published_by: string; crew_documents: { id: string; crew_member_id: string; owner_id: string; title: string; document_kind: string; storage_path: string; mime_type: string } };
  const members = new Map((team.data as unknown as Member[]).map((m) => [m.crew_member_id, m.crew_members]));
  return (shares.data as unknown as Share[]).flatMap((share) => {
    const doc = share.crew_documents;
    const member = members.get(doc.crew_member_id);
    if (!member || member.owner_id !== doc.owner_id || share.published_by !== doc.owner_id) return [];
    const prefix = `${doc.owner_id}/${doc.crew_member_id}/${doc.id}.`;
    if (!doc.storage_path.startsWith(prefix) || doc.storage_path.includes('..') || doc.storage_path.includes('\\')) return [];
    return [{ id: doc.id, title: doc.title, kind: doc.document_kind, memberName: member.full_name, path: doc.storage_path }];
  });
}
