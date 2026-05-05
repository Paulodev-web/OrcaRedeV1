import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  CHAT_MESSAGES_PAGE_SIZE,
  type WorkMessage,
  type WorkMessageAttachment,
  type WorkMessageAttachmentKind,
  type WorkMessageSenderRole,
  type GetWorkMessagesResult,
} from '@/types/works';

interface RawAttachment {
  id: string;
  message_id: string;
  work_id: string;
  kind: WorkMessageAttachmentKind;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  duration_seconds: number | null;
  width: number | null;
  height: number | null;
  thumbnail_path: string | null;
  created_at: string;
}

interface RawMessage {
  id: string;
  work_id: string;
  sender_id: string;
  sender_role: WorkMessageSenderRole;
  body: string | null;
  client_event_id: string | null;
  read_by_engineer_at: string | null;
  read_by_manager_at: string | null;
  created_at: string;
  work_message_attachments: RawAttachment[] | null;
}

interface GetWorkMessagesOptions {
  /** Paginacao reversa: created_at do mais antigo carregado. */
  cursor?: string;
  /** Default 50. */
  limit?: number;
}

/**
 * Carrega mensagens de uma obra em ordem decrescente (mais recente primeiro)
 * para suportar paginacao reversa. O caller deve inverter o array para
 * renderizacao cronologica.
 *
 * RLS de work_messages e work_message_attachments restringe a membros da obra.
 */
export async function getWorkMessages(
  supabase: SupabaseClient,
  workId: string,
  options: GetWorkMessagesOptions = {},
): Promise<GetWorkMessagesResult> {
  const limit = options.limit ?? CHAT_MESSAGES_PAGE_SIZE;
  const fetchLimit = limit + 1;

  let query = supabase
    .from('work_messages')
    .select(
      `id, work_id, sender_id, sender_role, body, client_event_id,
       read_by_engineer_at, read_by_manager_at, created_at,
       work_message_attachments (
         id, message_id, work_id, kind, storage_path, mime_type, size_bytes,
         duration_seconds, width, height, thumbnail_path, created_at
       )`,
    )
    .eq('work_id', workId)
    .order('created_at', { ascending: false })
    .limit(fetchLimit);

  if (options.cursor) {
    query = query.lt('created_at', options.cursor);
  }

  const { data, error } = await query;
  if (error || !data) return { items: [], hasMore: false };

  const rows = data as unknown as RawMessage[];
  const hasMore = rows.length > limit;
  const sliced = hasMore ? rows.slice(0, limit) : rows;

  const items: WorkMessage[] = sliced.map(mapRawMessage);
  return { items, hasMore };
}

function mapRawMessage(row: RawMessage): WorkMessage {
  return {
    id: row.id,
    workId: row.work_id,
    senderId: row.sender_id,
    senderRole: row.sender_role,
    body: row.body,
    clientEventId: row.client_event_id,
    readByEngineerAt: row.read_by_engineer_at,
    readByManagerAt: row.read_by_manager_at,
    createdAt: row.created_at,
    attachments: (row.work_message_attachments ?? []).map(mapRawAttachment),
  };
}

function mapRawAttachment(row: RawAttachment): WorkMessageAttachment {
  return {
    id: row.id,
    messageId: row.message_id,
    workId: row.work_id,
    kind: row.kind,
    storagePath: row.storage_path,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    durationSeconds: row.duration_seconds,
    width: row.width,
    height: row.height,
    thumbnailPath: row.thumbnail_path,
    createdAt: row.created_at,
  };
}
