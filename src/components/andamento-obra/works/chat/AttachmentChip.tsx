'use client';

import { Image as ImageIcon, Video as VideoIcon, Mic, X, AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WorkMessageAttachmentKind } from '@/types/works';

export type StagedAttachmentStatus =
  | 'queued'
  | 'uploading'
  | 'uploaded'
  | 'error';

export interface StagedAttachment {
  localId: string;
  file: File;
  kind: WorkMessageAttachmentKind;
  status: StagedAttachmentStatus;
  progress: number;
  errorMessage?: string;
  storagePath?: string;
}

interface AttachmentChipProps {
  attachment: StagedAttachment;
  onRemove: () => void;
  onRetry?: () => void;
}

const KIND_ICON: Record<WorkMessageAttachmentKind, React.ComponentType<{ className?: string }>> = {
  image: ImageIcon,
  video: VideoIcon,
  audio: Mic,
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AttachmentChip({ attachment, onRemove, onRetry }: AttachmentChipProps) {
  const Icon = KIND_ICON[attachment.kind];
  const isUploading = attachment.status === 'uploading';
  const isError = attachment.status === 'error';

  return (
    <div
      className={cn(
        'group relative flex items-center gap-2 rounded-lg border bg-white px-2.5 py-1.5 text-xs shadow-sm transition-colors',
        isError ? 'border-red-300 bg-red-50' : 'border-gray-200',
      )}
    >
      <div
        className={cn(
          'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md',
          isError ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-500',
        )}
      >
        {isError ? (
          <AlertCircle className="h-4 w-4" />
        ) : isUploading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Icon className="h-4 w-4" />
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium text-[#1D3140]">{attachment.file.name}</span>
        <span className="text-[10px] text-gray-500">
          {isError
            ? attachment.errorMessage ?? 'Erro no upload'
            : isUploading
              ? `${formatBytes(attachment.file.size)} · enviando ${Math.round(attachment.progress)}%`
              : formatBytes(attachment.file.size)}
        </span>

        {isUploading && (
          <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full bg-[#64ABDE] transition-all"
              style={{ width: `${Math.max(2, Math.min(100, attachment.progress))}%` }}
            />
          </div>
        )}
      </div>

      {isError && onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-md px-1.5 py-0.5 text-[10px] font-medium text-red-700 hover:bg-red-100"
        >
          Tentar
        </button>
      )}

      <button
        type="button"
        onClick={onRemove}
        aria-label="Remover anexo"
        className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
