'use client';

import { useCallback, useRef, useState } from 'react';
import { Paperclip, Send, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  CHAT_ATTACHMENT_LIMITS,
  CHAT_MESSAGE_BODY_MAX,
  CHAT_MESSAGE_MAX_ATTACHMENTS,
  type SendWorkMessageAttachmentInput,
  type WorkMessageAttachmentKind,
} from '@/types/works';
import { getUploadUrlForChatAttachment } from '@/actions/workMessages';
import { supabase as supabaseBrowser } from '@/lib/supabaseClient';
import { AttachmentChip, type StagedAttachment } from './AttachmentChip';

interface ChatComposerProps {
  workId: string;
  disabled?: boolean;
  disabledMessage?: string;
  onSend: (input: {
    body: string;
    attachments: SendWorkMessageAttachmentInput[];
    clientEventId: string;
  }) => Promise<void>;
}

const ANDAMENTO_OBRA_BUCKET = 'andamento-obra';

function inferKind(file: File): WorkMessageAttachmentKind | null {
  const t = (file.type || '').toLowerCase();
  if (t.startsWith('image/')) return 'image';
  if (t.startsWith('video/')) return 'video';
  if (t.startsWith('audio/')) return 'audio';
  return null;
}

export function ChatComposer({
  workId,
  disabled = false,
  disabledMessage,
  onSend,
}: ChatComposerProps) {
  const [body, setBody] = useState('');
  const [staged, setStaged] = useState<StagedAttachment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const isUploading = staged.some((s) => s.status === 'uploading' || s.status === 'queued');
  const hasError = staged.some((s) => s.status === 'error');
  const canSend =
    !disabled &&
    !sending &&
    !isUploading &&
    !hasError &&
    (body.trim().length > 0 || staged.some((s) => s.status === 'uploaded'));

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const max = 6 * 24;
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
  }, []);

  function onPickFiles() {
    if (disabled || sending) return;
    fileInputRef.current?.click();
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);

    const remaining = CHAT_MESSAGE_MAX_ATTACHMENTS - staged.length;
    const incoming = Array.from(files).slice(0, remaining);
    if (files.length > remaining) {
      setError(`Máximo ${CHAT_MESSAGE_MAX_ATTACHMENTS} anexos por mensagem.`);
    }

    const newStaged: StagedAttachment[] = [];
    for (const file of incoming) {
      const kind = inferKind(file);
      if (!kind) {
        setError(`Tipo de arquivo não suportado: ${file.name}`);
        continue;
      }
      const limits = CHAT_ATTACHMENT_LIMITS[kind];
      if (file.size > limits.maxBytes) {
        const maxMb = Math.round(limits.maxBytes / (1024 * 1024));
        setError(`${capitalize(limits.label)} ${file.name} excede ${maxMb} MB.`);
        continue;
      }
      newStaged.push({
        localId: globalThis.crypto.randomUUID(),
        file,
        kind,
        status: 'queued',
        progress: 0,
      });
    }

    if (newStaged.length === 0) {
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setStaged((prev) => [...prev, ...newStaged]);
    if (fileInputRef.current) fileInputRef.current.value = '';

    for (const item of newStaged) {
      void uploadOne(item);
    }
  }

  async function uploadOne(target: StagedAttachment) {
    const localId = target.localId;
    setStaged((prev) =>
      prev.map((s) =>
        s.localId === localId ? { ...s, status: 'uploading', progress: 5 } : s,
      ),
    );

    const result = await getUploadUrlForChatAttachment({
      workId,
      kind: target.kind,
      fileName: target.file.name,
      sizeBytes: target.file.size,
      mimeType: target.file.type || undefined,
    });

    if (!result.success || !result.data) {
      const errMsg = !result.success ? result.error : 'Resposta inválida do servidor.';
      setStaged((prev) =>
        prev.map((s) =>
          s.localId === localId
            ? { ...s, status: 'error', errorMessage: errMsg }
            : s,
        ),
      );
      return;
    }

    setStaged((prev) =>
      prev.map((s) => (s.localId === localId ? { ...s, progress: 30 } : s)),
    );

    const { storagePath, uploadToken } = result.data;

    try {
      const { error: uploadError } = await supabaseBrowser.storage
        .from(ANDAMENTO_OBRA_BUCKET)
        .uploadToSignedUrl(storagePath, uploadToken, target.file, {
          contentType: target.file.type || undefined,
          upsert: false,
        });

      if (uploadError) {
        setStaged((prev) =>
          prev.map((s) =>
            s.localId === localId
              ? { ...s, status: 'error', errorMessage: uploadError.message }
              : s,
          ),
        );
        return;
      }

      setStaged((prev) =>
        prev.map((s) =>
          s.localId === localId
            ? { ...s, status: 'uploaded', progress: 100, storagePath }
            : s,
        ),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro inesperado.';
      setStaged((prev) =>
        prev.map((s) =>
          s.localId === localId
            ? { ...s, status: 'error', errorMessage: message }
            : s,
        ),
      );
    }
  }

  function removeStaged(localId: string) {
    setStaged((prev) => prev.filter((s) => s.localId !== localId));
    setError(null);
  }

  function retryStaged(localId: string) {
    let target: StagedAttachment | undefined;
    setStaged((prev) => {
      const next = prev.map((s) => {
        if (s.localId !== localId) return s;
        const updated = { ...s, status: 'queued' as const, progress: 0, errorMessage: undefined };
        target = updated;
        return updated;
      });
      return next;
    });
    if (target) void uploadOne(target);
  }

  async function doSend() {
    if (!canSend) return;
    setError(null);
    setSending(true);
    try {
      const trimmed = body.trim();
      const attachments: SendWorkMessageAttachmentInput[] = staged
        .filter((s): s is StagedAttachment & { storagePath: string } =>
          s.status === 'uploaded' && Boolean(s.storagePath),
        )
        .map((s) => ({
          kind: s.kind,
          storagePath: s.storagePath,
          mimeType: s.file.type || undefined,
          sizeBytes: s.file.size,
        }));

      await onSend({
        body: trimmed,
        attachments,
        clientEventId: globalThis.crypto.randomUUID(),
      });

      setBody('');
      setStaged([]);
      adjustHeight();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao enviar mensagem.';
      setError(message);
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void doSend();
    }
  }

  function onChangeBody(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const v = e.target.value.slice(0, CHAT_MESSAGE_BODY_MAX);
    if (v.length === CHAT_MESSAGE_BODY_MAX && e.target.value.length > CHAT_MESSAGE_BODY_MAX) {
      setError(`Mensagem cortada em ${CHAT_MESSAGE_BODY_MAX} caracteres.`);
    }
    setBody(v);
    adjustHeight();
  }

  if (disabled) {
    return (
      <div className="border-t border-gray-200 bg-gray-50 px-4 py-3 text-center">
        <p className="text-xs text-gray-500">
          {disabledMessage ?? 'Envio desabilitado.'}
        </p>
      </div>
    );
  }

  return (
    <div className="border-t border-gray-200 bg-white">
      {staged.length > 0 && (
        <div className="flex flex-wrap gap-2 border-b border-gray-100 px-3 py-2 sm:px-4">
          {staged.map((s) => (
            <AttachmentChip
              key={s.localId}
              attachment={s}
              onRemove={() => removeStaged(s.localId)}
              onRetry={() => retryStaged(s.localId)}
            />
          ))}
        </div>
      )}

      {error && (
        <div className="border-b border-red-100 bg-red-50 px-3 py-1.5 text-xs text-red-700 sm:px-4">
          {error}
        </div>
      )}

      <div className="flex items-end gap-2 px-2 py-2 sm:px-3">
        <button
          type="button"
          onClick={onPickFiles}
          disabled={sending || isUploading || staged.length >= CHAT_MESSAGE_MAX_ATTACHMENTS}
          aria-label="Anexar mídia"
          className={cn(
            'flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-gray-500 transition-colors',
            'hover:bg-gray-100 hover:text-[#1D3140]',
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
        >
          <Paperclip className="h-4 w-4" />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*,audio/*"
          multiple
          className="hidden"
          onChange={(e) => void handleFiles(e.target.files)}
        />

        <textarea
          ref={textareaRef}
          value={body}
          onChange={onChangeBody}
          onKeyDown={onKeyDown}
          placeholder="Mensagem..."
          rows={1}
          disabled={sending}
          className={cn(
            'min-h-[40px] flex-1 resize-none rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm leading-snug',
            'outline-none transition-colors placeholder:text-gray-400',
            'focus:border-[#64ABDE]/60 focus:bg-white focus:ring-2 focus:ring-[#64ABDE]/20',
            'disabled:cursor-wait disabled:opacity-70',
          )}
        />

        <button
          type="button"
          onClick={() => void doSend()}
          disabled={!canSend}
          aria-label="Enviar mensagem"
          className={cn(
            'flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full transition-colors',
            canSend
              ? 'bg-[#64ABDE] text-white hover:bg-[#4f9ad0]'
              : 'cursor-not-allowed bg-gray-200 text-gray-400',
          )}
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
