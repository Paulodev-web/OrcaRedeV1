'use client';

import { useCallback, useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ChevronLeft, ChevronRight, ImageOff, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ImageLightboxProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  images: string[];
  initialIndex?: number;
  alt?: string;
}

/**
 * Lightbox de imagens compartilhado entre chat, diario e marcos.
 * Reside em `shared/` para reutilizacao entre features de andamento-obra.
 *
 * O wrapper de chat re-exporta este componente para preservar imports
 * existentes (`from '../chat/ImageLightbox'`).
 */
export function ImageLightbox({
  open,
  onOpenChange,
  images,
  initialIndex = 0,
  alt = 'Imagem',
}: ImageLightboxProps) {
  if (images.length === 0) return null;
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed inset-0 z-50 flex items-center justify-center p-4 outline-none"
          aria-describedby={undefined}
        >
          <Dialog.Title className="sr-only">{alt}</Dialog.Title>
          {open && (
            <LightboxBody images={images} initialIndex={initialIndex} alt={alt} />
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function LightboxBody({
  images,
  initialIndex,
  alt,
}: {
  images: string[];
  initialIndex: number;
  alt: string;
}) {
  const [index, setIndex] = useState(() =>
    Math.max(0, Math.min(initialIndex, images.length - 1)),
  );

  const next = useCallback(() => {
    setIndex((i) => (i + 1) % images.length);
  }, [images.length]);
  const prev = useCallback(() => {
    setIndex((i) => (i - 1 + images.length) % images.length);
  }, [images.length]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') prev();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev]);

  const current = images[Math.max(0, Math.min(index, images.length - 1))];
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    setErrored(false);
  }, [current]);

  return (
    <>
      <Dialog.Close
        aria-label="Fechar"
        className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition-colors hover:bg-white/20"
      >
        <X className="h-5 w-5" />
      </Dialog.Close>

      {images.length > 1 && (
        <>
          <button
            type="button"
            onClick={prev}
            aria-label="Imagem anterior"
            className={cn(
              'absolute left-4 top-1/2 z-10 -translate-y-1/2',
              'flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition-colors hover:bg-white/20',
            )}
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button
            type="button"
            onClick={next}
            aria-label="Próxima imagem"
            className={cn(
              'absolute right-4 top-1/2 z-10 -translate-y-1/2',
              'flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition-colors hover:bg-white/20',
            )}
          >
            <ChevronRight className="h-6 w-6" />
          </button>
          <div className="absolute bottom-6 left-1/2 z-10 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-xs text-white backdrop-blur-sm">
            {index + 1} / {images.length}
          </div>
        </>
      )}

      {errored ? (
        <div className="flex flex-col items-center gap-2 text-white/60">
          <ImageOff className="h-10 w-10" />
          <span className="text-sm">Mídia indisponível</span>
        </div>
      ) : (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={current}
          alt={alt}
          className="max-h-[90vh] max-w-[90vw] select-none object-contain"
          draggable={false}
          onError={() => setErrored(true)}
        />
      )}
    </>
  );
}
