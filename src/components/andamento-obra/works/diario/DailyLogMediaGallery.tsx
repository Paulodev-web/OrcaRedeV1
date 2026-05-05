'use client';

import { useState } from 'react';
import { ImageIcon, Video, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WorkDailyLogMedia } from '@/types/works';
import { MediaFallback } from '../shared/MediaFallback';
import { ImageLightbox } from '../shared/ImageLightbox';

interface DailyLogMediaGalleryProps {
  media: WorkDailyLogMedia[];
  signedUrls: Record<string, string>;
}

export function DailyLogMediaGallery({ media, signedUrls }: DailyLogMediaGalleryProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [errorPaths, setErrorPaths] = useState<Set<string>>(new Set());

  if (media.length === 0) return null;

  const markError = (path: string) => {
    setErrorPaths((prev) => new Set(prev).add(path));
  };

  const images = media.filter((m) => m.kind === 'image');
  const imageUrls = images
    .map((m) => signedUrls[m.storagePath])
    .filter((u): u is string => Boolean(u));

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
        {media.map((m) => {
          const url = signedUrls[m.storagePath];
          const hasError = errorPaths.has(m.storagePath);

          if (!url || hasError) {
            return (
              <MediaFallback
                key={m.id}
                kind={m.kind}
                className="aspect-square rounded-lg border border-dashed border-gray-200"
              />
            );
          }
          if (m.kind === 'image') {
            const idx = images.findIndex((im) => im.id === m.id);
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setLightboxIndex(idx)}
                className={cn(
                  'group relative aspect-square overflow-hidden rounded-lg border border-gray-200 bg-gray-100 transition',
                  'hover:ring-2 hover:ring-[#64ABDE]',
                )}
                aria-label="Abrir imagem em tela cheia"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt="Foto do diário"
                  className="h-full w-full object-cover"
                  loading="lazy"
                  draggable={false}
                  onError={() => markError(m.storagePath)}
                />
                <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition group-hover:bg-black/30 group-hover:opacity-100">
                  <Eye className="h-5 w-5" />
                </span>
                <span className="pointer-events-none absolute left-1 top-1 inline-flex items-center gap-1 rounded-full bg-black/50 px-1.5 py-0.5 text-[9px] text-white">
                  <ImageIcon className="h-2.5 w-2.5" />
                </span>
              </button>
            );
          }
          return (
            <div
              key={m.id}
              className="relative aspect-square overflow-hidden rounded-lg border border-gray-200 bg-black"
            >
              <video
                controls
                src={url}
                className="h-full w-full object-cover"
                preload="metadata"
                onError={() => markError(m.storagePath)}
              />
              <span className="pointer-events-none absolute left-1 top-1 inline-flex items-center gap-1 rounded-full bg-black/50 px-1.5 py-0.5 text-[9px] text-white">
                <Video className="h-2.5 w-2.5" />
              </span>
            </div>
          );
        })}
      </div>

      <ImageLightbox
        open={lightboxIndex !== null}
        onOpenChange={(o) => !o && setLightboxIndex(null)}
        images={imageUrls}
        initialIndex={lightboxIndex ?? 0}
        alt="Foto do diário"
      />
    </div>
  );
}
