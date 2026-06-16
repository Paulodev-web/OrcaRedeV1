'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  ExternalLink,
  Headphones,
  Image as ImageIcon,
  MessageSquare,
  ClipboardList,
  Flag,
  HardHat,
  Video,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { GalleryItem, GalleryItemSource } from '@/types/works';
import { MediaFallback } from '../shared/MediaFallback';

interface GalleryItemProps {
  item: GalleryItem;
  onOpenImage?: () => void;
}

const SOURCE_ICON: Record<
  GalleryItemSource,
  { icon: typeof MessageSquare; label: string }
> = {
  chat: { icon: MessageSquare, label: 'Chat' },
  daily_log: { icon: ClipboardList, label: 'Diário' },
  milestone: { icon: Flag, label: 'Marco' },
  installation: { icon: HardHat, label: 'Instalação' },
  checklist_item: { icon: CheckCircle2, label: 'Checklist' },
  alert: { icon: AlertTriangle, label: 'Alerta' },
};

export function GalleryItemView({ item, onOpenImage }: GalleryItemProps) {
  const sourceMeta = SOURCE_ICON[item.source];
  const SourceIcon = sourceMeta.icon;
  const [errored, setErrored] = useState(false);

  return (
    <article
      className={cn(
        'group flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-white transition-shadow hover:shadow-md',
      )}
    >
      <div className="relative aspect-square w-full overflow-hidden bg-gray-100">
        {!item.signedUrl || errored ? (
          <MediaFallback kind={item.kind} className="h-full w-full" />
        ) : item.kind === 'image' ? (
          <button
            type="button"
            onClick={onOpenImage}
            className="block h-full w-full"
            aria-label="Abrir imagem em tela cheia"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.signedUrl}
              alt={item.contextLabel}
              className="h-full w-full object-cover"
              loading="lazy"
              draggable={false}
              onError={() => setErrored(true)}
            />
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition group-hover:bg-black/30 group-hover:opacity-100">
              <Eye className="h-5 w-5" />
            </span>
          </button>
        ) : item.kind === 'video' ? (
          <video
            controls
            src={item.signedUrl}
            className="h-full w-full object-cover"
            preload="metadata"
            onError={() => setErrored(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200">
            <audio
              controls
              src={item.signedUrl}
              className="w-[90%]"
              onError={() => setErrored(true)}
            />
          </div>
        )}

        {!errored && item.signedUrl && (
          <span className="pointer-events-none absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white">
            <KindIcon kind={item.kind} />
            {item.kind === 'image'
              ? 'Foto'
              : item.kind === 'video'
                ? 'Vídeo'
                : 'Áudio'}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1 px-2.5 py-2">
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-[#1D3140]">
          <SourceIcon className="h-3 w-3 text-gray-500" aria-hidden="true" />
          <span className="truncate">{item.contextLabel}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] text-gray-400">
            {formatDateTimeShort(item.createdAt)}
          </span>
          <Link
            href={item.linkPath}
            className="inline-flex items-center gap-0.5 text-[10px] font-medium text-[#64ABDE] hover:underline"
            title="Ver no contexto"
          >
            Ver no contexto
            <ExternalLink className="h-2.5 w-2.5" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </article>
  );
}

function KindIcon({ kind }: { kind: GalleryItem['kind'] }) {
  if (kind === 'image') return <ImageIcon className="h-2.5 w-2.5" />;
  if (kind === 'video') return <Video className="h-2.5 w-2.5" />;
  return <Headphones className="h-2.5 w-2.5" />;
}

function formatDateTimeShort(iso: string): string {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return '—';
  return dt.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
