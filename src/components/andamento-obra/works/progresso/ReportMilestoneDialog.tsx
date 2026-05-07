'use client';

import { useState, useTransition } from 'react';
import { Camera, Loader2, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  getUploadUrlForMilestoneEvidence,
  reportMilestone,
} from '@/actions/workMilestones';
import {
  DAILY_LOG_MEDIA_LIMITS,
  MILESTONE_NOTES_MAX,
  type ReportMilestoneMediaInput,
} from '@/types/works';

interface ReportMilestoneDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workId: string;
  milestoneId: string;
  milestoneName: string;
  onReported?: () => void;
}

interface UploadedItem {
  storagePath: string;
  fileName: string;
  kind: 'image' | 'video';
  sizeBytes: number;
  mimeType: string;
  eventId: string;
  previewUrl: string;
}

/**
 * Form de reporte de marco. Manager faz upload de fotos via signed URL,
 * depois submete reportMilestone com paths + eventId compartilhado.
 *
 * Nesta fase o portal nao tem manager real, mas o dialog cobre o caminho
 * client completo para quando o APK chamar o mesmo Server Action.
 */
export function ReportMilestoneDialog({
  open,
  onOpenChange,
  workId,
  milestoneId,
  milestoneName,
  onReported,
}: ReportMilestoneDialogProps) {
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<UploadedItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClose(next: boolean) {
    if (!next) {
      setNotes('');
      setItems([]);
      setError(null);
    }
    onOpenChange(next);
  }

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    setUploading(true);
    try {
      // eventId compartilhado para todas as midias de um mesmo reporte.
      // O server gera/valida; passamos string vazia para o primeiro upload e
      // reaproveitamos o eventId retornado.
      let sharedEventId = items.length > 0 ? items[0].eventId : '';

      const newItems: UploadedItem[] = [];
      for (const file of Array.from(files)) {
        const isImage = file.type.startsWith('image/');
        const isVideo = file.type.startsWith('video/');
        if (!isImage && !isVideo) {
          throw new Error(`Tipo nao suportado: ${file.type}`);
        }
        const kind: 'image' | 'video' = isImage ? 'image' : 'video';
        const limits = DAILY_LOG_MEDIA_LIMITS[kind];
        if (file.size > limits.maxBytes) {
          const maxMb = Math.round(limits.maxBytes / (1024 * 1024));
          throw new Error(`${file.name} excede ${maxMb} MB.`);
        }

        const urlResult = await getUploadUrlForMilestoneEvidence({
          workId,
          milestoneId,
          // String vazia leva o server a gerar UUID novo no primeiro upload;
          // nos uploads seguintes reutilizamos o sharedEventId retornado.
          eventId: sharedEventId,
          kind,
          fileName: file.name,
          sizeBytes: file.size,
          mimeType: file.type,
        });
        if (!urlResult.success || !urlResult.data) {
          throw new Error(urlResult.success ? 'Resposta inválida.' : urlResult.error);
        }
        if (!sharedEventId) sharedEventId = urlResult.data.eventId;

        const putResp = await fetch(urlResult.data.uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': file.type, 'x-upsert': 'false' },
          body: file,
        });
        if (!putResp.ok) {
          throw new Error(`Falha no upload: ${putResp.status}`);
        }

        newItems.push({
          storagePath: urlResult.data.storagePath,
          fileName: file.name,
          kind,
          sizeBytes: file.size,
          mimeType: file.type,
          eventId: urlResult.data.eventId,
          previewUrl: URL.createObjectURL(file),
        });
      }

      setItems((prev) => [...prev, ...newItems]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha no upload.');
    } finally {
      setUploading(false);
    }
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (items.length === 0) {
      setError('Anexe ao menos uma foto.');
      return;
    }
    if (notes.length > MILESTONE_NOTES_MAX) {
      setError(`Observação muito longa (máx. ${MILESTONE_NOTES_MAX}).`);
      return;
    }
    setError(null);
    const eventId = items[0].eventId;
    const media: ReportMilestoneMediaInput[] = items.map((it) => ({
      eventId,
      kind: it.kind,
      storagePath: it.storagePath,
      mimeType: it.mimeType,
      sizeBytes: it.sizeBytes,
    }));
    startTransition(async () => {
      const result = await reportMilestone({
        milestoneId,
        notes: notes.trim() || null,
        media,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      onReported?.();
      handleClose(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Reportar conclusão</DialogTitle>
          <DialogDescription>
            Marco: <strong className="font-semibold">{milestoneName}</strong>. Anexe ao
            menos uma foto e adicione observações se necessário.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="flex flex-col gap-3 px-6 py-4">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-700">
              Observações (opcional)
            </span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={MILESTONE_NOTES_MAX}
              rows={3}
              disabled={isPending}
              className="w-full resize-none rounded-md border border-gray-200 px-3 py-2 text-sm text-[#1D3140] focus:border-[#64ABDE] focus:outline-none focus:ring-1 focus:ring-[#64ABDE]"
            />
          </label>

          <div>
            <span className="mb-1 block text-xs font-medium text-gray-700">
              Evidências (mínimo 1)
            </span>
            <label
              className={cn(
                'flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed px-3 py-3 text-sm',
                'border-gray-300 text-gray-600 hover:bg-gray-50',
              )}
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Camera className="h-4 w-4" />
              )}
              <span>{uploading ? 'Enviando...' : 'Adicionar fotos ou vídeo'}</span>
              <input
                type="file"
                accept="image/*,video/*"
                multiple
                disabled={uploading || isPending}
                onChange={(e) => void onFiles(e.target.files)}
                className="hidden"
              />
            </label>

            {items.length > 0 && (
              <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {items.map((it, idx) => (
                  <li
                    key={`${it.storagePath}-${idx}`}
                    className="relative aspect-square overflow-hidden rounded-md border border-gray-200 bg-gray-100"
                  >
                    {it.kind === 'image' ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={it.previewUrl}
                        alt={it.fileName}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <video src={it.previewUrl} className="h-full w-full object-cover" />
                    )}
                    <button
                      type="button"
                      aria-label="Remover"
                      onClick={() => removeItem(idx)}
                      className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {error && (
            <p role="alert" className="text-xs text-red-600">
              {error}
            </p>
          )}

          <DialogFooter className="-mx-6 -mb-4 mt-2">
            <button
              type="button"
              onClick={() => handleClose(false)}
              disabled={isPending}
              className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isPending || uploading}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {isPending ? 'Reportando...' : 'Reportar conclusão'}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
