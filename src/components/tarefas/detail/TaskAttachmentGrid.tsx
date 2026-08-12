'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { FileText, Loader2, Paperclip, Trash2, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  deleteTaskAttachmentAction,
  getTaskAttachmentUrlsAction,
} from '@/app/tarefas/_actions/tasks';
import { uploadTaskFiles } from './uploadTaskFiles';
import type { TaskAttachmentRow } from '@/types/tasks';

interface TaskAttachmentGridProps {
  taskId: string;
  orgId: string;
  viewerId: string;
  attachments: TaskAttachmentRow[];
  onChanged: () => void;
}

function isImage(mime: string | null): boolean {
  return Boolean(mime?.startsWith('image/'));
}

function humanSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Grade de anexos do card, com upload por arrastar, colar ou botão.
 *
 * Mostra tanto os anexos soltos do card quanto os que vieram dentro de uma
 * mensagem do chat — é o `message_id NULL` de `task_attachments` que permite as
 * duas portas caírem no mesmo lugar, sem o usuário ter que escolher onde põe o
 * arquivo.
 */
export function TaskAttachmentGrid({
  taskId,
  orgId,
  viewerId,
  attachments,
  onChanged,
}: TaskAttachmentGridProps) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);
  const [lightbox, setLightbox] = useState<TaskAttachmentRow | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // O bucket é privado: cada caminho precisa de uma URL assinada. Uma chamada
  // em lote por render de lista, não uma por miniatura.
  useEffect(() => {
    const paths = attachments.map((a) => a.storagePath);
    // Sem anexos não há o que assinar. As URLs antigas ficam no estado sem
    // efeito: nada as renderiza, e limpá-las aqui seria um setState dentro do
    // efeito por nada.
    if (paths.length === 0) return;
    let cancelled = false;
    void getTaskAttachmentUrlsAction(paths).then((result) => {
      if (!cancelled && result.success) setUrls(result.data ?? {});
    });
    return () => {
      cancelled = true;
    };
  }, [attachments]);

  const handleFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setUploading({ done: 0, total: files.length });
      const { errors } = await uploadTaskFiles(orgId, taskId, files, (done, total) =>
        setUploading({ done, total }),
      );
      setUploading(null);
      for (const message of errors) toast.error(message);
      onChanged();
    },
    [orgId, taskId, onChanged],
  );

  // Colar print da área de transferência é como metade das fotos chega.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.files ?? []);
      if (files.length > 0) void handleFiles(files);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [handleFiles]);

  const handleDelete = async (attachment: TaskAttachmentRow) => {
    const result = await deleteTaskAttachmentAction(attachment.id);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    onChanged();
  };

  return (
    <section
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void handleFiles(Array.from(e.dataTransfer.files));
      }}
      className={cn(
        'rounded-xl border border-neutral-200 bg-surface p-4 transition-colors duration-150',
        dragging && 'border-accent-300 bg-accent-50',
      )}
    >
      <header className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-neutral-900">
          <Paperclip className="h-3.5 w-3.5 text-neutral-400" aria-hidden />
          Anexos
          {attachments.length > 0 && (
            <span className="text-xs font-normal text-neutral-500">({attachments.length})</span>
          )}
        </h2>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-link hover:underline"
        >
          <Upload className="h-3.5 w-3.5" aria-hidden />
          Enviar arquivo
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            void handleFiles(Array.from(e.target.files ?? []));
            e.target.value = '';
          }}
        />
      </header>

      {uploading && (
        <p className="mb-3 flex items-center gap-2 text-xs text-neutral-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          Enviando {uploading.done} de {uploading.total}…
        </p>
      )}

      {attachments.length === 0 && !uploading ? (
        <p className="rounded-lg border border-dashed border-neutral-300 px-3 py-6 text-center text-xs text-neutral-400">
          Arraste arquivos aqui, cole um print ou use “Enviar arquivo”.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {attachments.map((attachment) => {
            const url = urls[attachment.storagePath];
            const image = isImage(attachment.mimeType);
            const mine = attachment.uploadedBy === viewerId;

            return (
              <li key={attachment.id} className="group relative">
                <button
                  type="button"
                  onClick={() => (image ? setLightbox(attachment) : url && window.open(url, '_blank'))}
                  className="block w-full overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50 text-left transition-shadow hover:shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
                >
                  {image && url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={url}
                      alt={attachment.fileName}
                      width={attachment.width ?? undefined}
                      height={attachment.height ?? undefined}
                      className="aspect-4/3 w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <span className="flex aspect-4/3 w-full items-center justify-center">
                      <FileText className="h-6 w-6 text-neutral-400" aria-hidden />
                    </span>
                  )}
                  <span className="block truncate px-2 py-1.5 text-[11px] text-neutral-600">
                    {attachment.fileName}
                    {attachment.fileSize ? (
                      <span className="text-neutral-400"> · {humanSize(attachment.fileSize)}</span>
                    ) : null}
                  </span>
                </button>

                {mine && (
                  <button
                    type="button"
                    onClick={() => void handleDelete(attachment)}
                    aria-label={`Remover ${attachment.fileName}`}
                    className="absolute right-1 top-1 hidden rounded-md bg-surface/90 p-1 text-neutral-500 shadow-2xs transition-colors hover:text-red-600 group-hover:block"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {lightbox && urls[lightbox.storagePath] && (
        <div
          role="dialog"
          aria-modal
          aria-label={lightbox.fileName}
          onClick={() => setLightbox(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/70 p-6 animate-overlay-in"
        >
          <button
            type="button"
            aria-label="Fechar"
            className="absolute right-4 top-4 rounded-md bg-surface/90 p-2 text-neutral-700"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={urls[lightbox.storagePath]}
            alt={lightbox.fileName}
            className="max-h-full max-w-full rounded-lg object-contain"
          />
        </div>
      )}
    </section>
  );
}
