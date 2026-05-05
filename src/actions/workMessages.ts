'use server';

import { revalidatePath } from 'next/cache';
import { ensureMember } from '@/lib/auth/ensureMember';
import { createSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import { getWorkMessages } from '@/services/works/getWorkMessages';
import { getAttachmentSignedUrls } from '@/services/works/getAttachmentSignedUrls';
import {
  CHAT_ATTACHMENT_LIMITS,
  CHAT_MESSAGE_BODY_MAX,
  CHAT_MESSAGE_MAX_ATTACHMENTS,
  type ActionResult,
  type ChatAttachmentUploadInfo,
  type GetUploadUrlForChatAttachmentInput,
  type SendWorkMessageInput,
  type WorkMessage,
  type WorkMessageAttachment,
  type WorkMessageAttachmentKind,
  type WorkMessageSenderRole,
} from '@/types/works';

const ANDAMENTO_OBRA_BUCKET = 'andamento-obra';
const WORKS_PATH = '/tools/andamento-obra';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function generateUuid(): string {
  return globalThis.crypto.randomUUID();
}

function sanitizeFileName(name: string): string {
  const lastDot = name.lastIndexOf('.');
  const base = lastDot > 0 ? name.slice(0, lastDot) : name;
  const ext = lastDot > 0 ? name.slice(lastDot + 1).toLowerCase() : '';
  const safeBase = base.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 64) || 'file';
  const safeExt = ext.replace(/[^a-zA-Z0-9]+/g, '').slice(0, 10);
  return safeExt ? `${safeBase}.${safeExt}` : safeBase;
}

function inferExtension(fileName: string, mimeType: string | undefined, kind: WorkMessageAttachmentKind): string {
  const lastDot = fileName.lastIndexOf('.');
  if (lastDot > 0) {
    const ext = fileName.slice(lastDot + 1).toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (ext.length > 0 && ext.length <= 10) return ext;
  }
  if (mimeType) {
    const subtype = mimeType.split('/')[1]?.toLowerCase().replace(/[^a-z0-9]+/g, '') ?? '';
    if (subtype.length > 0 && subtype.length <= 10) return subtype;
  }
  return kind === 'image' ? 'bin' : kind === 'video' ? 'mp4' : 'mp3';
}

/**
 * Gera URL assinada de upload para um anexo do chat.
 *
 * Fluxo (5 passos):
 *  1) ensureMember(workId) - valida acesso a obra e retorna role
 *  2) Validar limites por tipo (image 10MB, video 100MB, audio 25MB)
 *  3) Gerar messageId provisorio (UUID v4) e fileId (UUID v4)
 *  4) Construir path: {workId}/chat/{messageId}/{fileId}.{ext}
 *  5) Criar signed upload URL via service role (TTL platform default)
 *
 * Decisao de design: messageId e gerado pela action (nao pelo client) para
 * centralizar a geracao e garantir formato. O sendWorkMessage usa esse
 * messageId como id do INSERT.
 *
 * Limitacao conhecida: createSignedUploadUrl em supabase-js@2.100 nao
 * aceita parametro expiresIn; TTL e o default da plataforma (~2h).
 * Validacao real de janela de upload acontece no proximo INSERT (que
 * exige sender_id == auth.uid() via RLS).
 */
export async function getUploadUrlForChatAttachment(
  input: GetUploadUrlForChatAttachmentInput,
): Promise<ActionResult<ChatAttachmentUploadInfo>> {
  const gate = await ensureMember(input.workId);
  if (!gate.ok) return { success: false, error: gate.error };

  const kind = input.kind;
  if (kind !== 'image' && kind !== 'video' && kind !== 'audio') {
    return { success: false, error: 'Tipo de anexo inválido.' };
  }

  const limits = CHAT_ATTACHMENT_LIMITS[kind];
  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) {
    return { success: false, error: 'Tamanho do arquivo inválido.' };
  }
  if (input.sizeBytes > limits.maxBytes) {
    const maxMb = Math.round(limits.maxBytes / (1024 * 1024));
    return {
      success: false,
      error: `${capitalize(limits.label)} excede ${maxMb} MB.`,
    };
  }

  if (input.mimeType && !input.mimeType.startsWith(limits.mimePrefix)) {
    return {
      success: false,
      error: `Tipo MIME não compatível com ${limits.label}.`,
    };
  }

  const fileName = (input.fileName ?? '').trim();
  if (fileName.length === 0) {
    return { success: false, error: 'Nome do arquivo inválido.' };
  }

  const messageId =
    input.messageId && UUID_RE.test(input.messageId) ? input.messageId : generateUuid();
  const fileId = generateUuid();
  const ext = inferExtension(fileName, input.mimeType, kind);
  const safeOriginal = sanitizeFileName(fileName);
  void safeOriginal;
  const finalName = `${fileId}.${ext}`;
  const storagePath = `${input.workId}/chat/${messageId}/${finalName}`;

  const serviceRole = createSupabaseServiceRoleClient();
  const { data, error } = await serviceRole.storage
    .from(ANDAMENTO_OBRA_BUCKET)
    .createSignedUploadUrl(storagePath);

  if (error || !data) {
    return {
      success: false,
      error: error?.message ?? 'Falha ao gerar URL de upload.',
    };
  }

  return {
    success: true,
    data: {
      uploadUrl: data.signedUrl,
      uploadToken: data.token,
      storagePath,
      messageId,
    },
  };
}

/**
 * Envia uma mensagem do chat. Pode incluir body, attachments (com paths
 * ja uploadados via signed URL), ou ambos.
 *
 * Fluxo:
 *  1) ensureMember(workId) - valida e retorna role
 *  2) Validar: body OU attachments obrigatorio; nao apenas whitespace
 *  3) Validar: body.length <= 4000, attachments.length <= 10
 *  4) Idempotencia via clientEventId (retorna msg existente se houver)
 *  5) INSERT em work_messages (RLS valida sender_role bate com role real)
 *  6) INSERT batch em work_message_attachments
 *  7) revalidatePath na home para refletir last_activity_at
 *
 * Triggers AFTER INSERT cuidam de:
 *  - inserir notification para o destinatario
 *  - atualizar works.last_activity_at
 */
export async function sendWorkMessage(
  input: SendWorkMessageInput,
): Promise<ActionResult<{ messageId: string }>> {
  const gate = await ensureMember(input.workId);
  if (!gate.ok) return { success: false, error: gate.error };

  const trimmedBody = typeof input.body === 'string' ? input.body.trim() : '';
  const attachments = Array.isArray(input.attachments) ? input.attachments : [];

  if (trimmedBody.length === 0 && attachments.length === 0) {
    return {
      success: false,
      error: 'Mensagem vazia: digite algo ou anexe uma mídia.',
    };
  }
  if (trimmedBody.length > CHAT_MESSAGE_BODY_MAX) {
    return {
      success: false,
      error: `Mensagem muito longa (máx. ${CHAT_MESSAGE_BODY_MAX} caracteres).`,
    };
  }
  if (attachments.length > CHAT_MESSAGE_MAX_ATTACHMENTS) {
    return {
      success: false,
      error: `Máximo de ${CHAT_MESSAGE_MAX_ATTACHMENTS} anexos por mensagem.`,
    };
  }

  for (const att of attachments) {
    if (!att || typeof att !== 'object') {
      return { success: false, error: 'Anexo inválido.' };
    }
    if (att.kind !== 'image' && att.kind !== 'video' && att.kind !== 'audio') {
      return { success: false, error: 'Tipo de anexo inválido.' };
    }
    if (typeof att.storagePath !== 'string' || att.storagePath.length === 0) {
      return { success: false, error: 'Path de anexo inválido.' };
    }
    const expectedPrefix = `${input.workId}/chat/`;
    if (!att.storagePath.startsWith(expectedPrefix)) {
      return { success: false, error: 'Path de anexo fora da obra.' };
    }
    if (att.mimeType) {
      const limits = CHAT_ATTACHMENT_LIMITS[att.kind];
      if (!att.mimeType.startsWith(limits.mimePrefix)) {
        return {
          success: false,
          error: `Tipo MIME não compatível com ${limits.label}.`,
        };
      }
    }
    if (typeof att.sizeBytes === 'number' && att.sizeBytes > 0) {
      const limits = CHAT_ATTACHMENT_LIMITS[att.kind];
      if (att.sizeBytes > limits.maxBytes) {
        const maxMb = Math.round(limits.maxBytes / (1024 * 1024));
        return {
          success: false,
          error: `${capitalize(limits.label)} excede ${maxMb} MB.`,
        };
      }
    }
  }

  const clientEventId =
    input.clientEventId && UUID_RE.test(input.clientEventId)
      ? input.clientEventId
      : null;

  if (clientEventId) {
    const { data: existing } = await gate.supabase
      .from('work_messages')
      .select('id')
      .eq('client_event_id', clientEventId)
      .maybeSingle();
    if (existing && existing.id) {
      return { success: true, data: { messageId: existing.id as string } };
    }
  }

  const messageId =
    input.messageId && UUID_RE.test(input.messageId) ? input.messageId : generateUuid();

  const { error: msgError } = await gate.supabase
    .from('work_messages')
    .insert({
      id: messageId,
      work_id: input.workId,
      sender_id: gate.userId,
      sender_role: gate.role,
      body: trimmedBody.length > 0 ? trimmedBody : null,
      client_event_id: clientEventId,
    });

  if (msgError) {
    return {
      success: false,
      error: msgError.message ?? 'Falha ao enviar mensagem.',
    };
  }

  if (attachments.length > 0) {
    const rows = attachments.map((a) => ({
      message_id: messageId,
      work_id: input.workId,
      kind: a.kind,
      storage_path: a.storagePath,
      mime_type: a.mimeType ?? null,
      size_bytes: typeof a.sizeBytes === 'number' && a.sizeBytes > 0 ? a.sizeBytes : null,
      duration_seconds:
        typeof a.durationSeconds === 'number' && a.durationSeconds > 0
          ? a.durationSeconds
          : null,
      width: typeof a.width === 'number' && a.width > 0 ? a.width : null,
      height: typeof a.height === 'number' && a.height > 0 ? a.height : null,
    }));

    const { error: attError } = await gate.supabase
      .from('work_message_attachments')
      .insert(rows);

    if (attError) {
      return {
        success: false,
        error: `Mensagem criada, mas falha ao salvar anexos: ${attError.message}`,
      };
    }
  }

  revalidatePath(WORKS_PATH);

  return { success: true, data: { messageId } };
}

/**
 * Marca como lidas todas as mensagens do outro lado da conversa.
 * Idempotente: roda WHERE read_by_<role>_at IS NULL.
 */
export async function markMessagesAsRead(
  workId: string,
): Promise<ActionResult<{ count: number }>> {
  const gate = await ensureMember(workId);
  if (!gate.ok) return { success: false, error: gate.error };

  const otherRole = gate.role === 'engineer' ? 'manager' : 'engineer';
  const readColumn =
    gate.role === 'engineer' ? 'read_by_engineer_at' : 'read_by_manager_at';

  const { data, error } = await gate.supabase
    .from('work_messages')
    .update({ [readColumn]: new Date().toISOString() })
    .eq('work_id', workId)
    .eq('sender_role', otherRole)
    .is(readColumn, null)
    .select('id');

  if (error) {
    return { success: false, error: error.message };
  }

  const count = Array.isArray(data) ? data.length : 0;
  if (count > 0) {
    revalidatePath(WORKS_PATH);
  }

  return { success: true, data: { count } };
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

interface RawAttachmentRow {
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

interface RawMessageRow {
  id: string;
  work_id: string;
  sender_id: string;
  sender_role: WorkMessageSenderRole;
  body: string | null;
  client_event_id: string | null;
  read_by_engineer_at: string | null;
  read_by_manager_at: string | null;
  created_at: string;
}

interface MessageWithSignedUrls {
  message: WorkMessage;
  signedUrls: Record<string, string>;
}

/**
 * Carrega anexos de uma mensagem ja inserida e retorna URLs assinadas.
 * Usado pelo client apos receber INSERT via Realtime (que nao traz a
 * sub-tabela work_message_attachments).
 *
 * Implementacao usa um pequeno retry para cobrir o gap entre o INSERT
 * de work_messages e o INSERT batch de attachments (a transacao do
 * sender persiste primeiro a mensagem; o broadcast Realtime pode
 * chegar antes de o batch de attachments ser visivel ao receiver).
 */
export async function getMessageWithAttachments(
  workId: string,
  messageId: string,
): Promise<ActionResult<MessageWithSignedUrls>> {
  const gate = await ensureMember(workId);
  if (!gate.ok) return { success: false, error: gate.error };

  if (!UUID_RE.test(messageId)) {
    return { success: false, error: 'ID de mensagem inválido.' };
  }

  const { data: msgData, error: msgError } = await gate.supabase
    .from('work_messages')
    .select(
      `id, work_id, sender_id, sender_role, body, client_event_id,
       read_by_engineer_at, read_by_manager_at, created_at`,
    )
    .eq('id', messageId)
    .eq('work_id', workId)
    .maybeSingle();

  if (msgError) return { success: false, error: msgError.message };
  if (!msgData) return { success: false, error: 'Mensagem não encontrada.' };
  const msg = msgData as unknown as RawMessageRow;

  let attRows: RawAttachmentRow[] = [];
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data, error } = await gate.supabase
      .from('work_message_attachments')
      .select(
        `id, message_id, work_id, kind, storage_path, mime_type, size_bytes,
         duration_seconds, width, height, thumbnail_path, created_at`,
      )
      .eq('message_id', messageId);

    if (error) {
      return { success: false, error: error.message };
    }
    attRows = (data ?? []) as unknown as RawAttachmentRow[];
    if (attRows.length > 0 || msg.body) break;
    if (attempt < 2) {
      await sleep(250);
    }
  }

  const attachments: WorkMessageAttachment[] = attRows.map((row) => ({
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
  }));

  const signedUrls = await getAttachmentSignedUrls(
    attachments.map((a) => a.storagePath),
  );

  const message: WorkMessage = {
    id: msg.id,
    workId: msg.work_id,
    senderId: msg.sender_id,
    senderRole: msg.sender_role,
    body: msg.body,
    clientEventId: msg.client_event_id,
    readByEngineerAt: msg.read_by_engineer_at,
    readByManagerAt: msg.read_by_manager_at,
    createdAt: msg.created_at,
    attachments,
  };

  return { success: true, data: { message, signedUrls } };
}

interface OlderMessagesResult {
  items: WorkMessage[];
  hasMore: boolean;
  signedUrls: Record<string, string>;
}

/**
 * Paginacao reversa: carrega mensagens mais antigas que o cursor.
 * Usado pelo botao "Carregar anteriores" no topo da lista.
 */
export async function getOlderWorkMessages(
  workId: string,
  cursor: string,
  limit?: number,
): Promise<ActionResult<OlderMessagesResult>> {
  const gate = await ensureMember(workId);
  if (!gate.ok) return { success: false, error: gate.error };

  const { items, hasMore } = await getWorkMessages(gate.supabase, workId, {
    cursor,
    limit,
  });

  const paths = items.flatMap((m) => m.attachments.map((a) => a.storagePath));
  const signedUrls = await getAttachmentSignedUrls(paths);

  return { success: true, data: { items, hasMore, signedUrls } };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
