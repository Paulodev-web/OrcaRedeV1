'use client';

import { useState } from 'react';
import { AlertCircle, FileWarning, Image as ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WorkMessageAttachment } from '@/types/works';

interface ChatAttachmentBubbleProps {
  attachment: WorkMessageAttachment;
  signedUrl: string | undefined;
  onOpenImage: (storagePath: string) => void;
}

export function ChatAttachmentBubble({
  attachment,
  signedUrl,
  onOpenImage,
}: ChatAttachmentBubbleProps) {
  if (!signedUrl) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-black/5 px-3 py-2 text-xs text-gray-600">
        <AlertCircle className="h-3.5 w-3.5" />
        <span>Mídia indisponível</span>
      </div>
    );
  }

  if (attachment.kind === 'image') {
    return <ImageBubble url={signedUrl} attachment={attachment} onOpen={onOpenImage} />;
  }
  if (attachment.kind === 'video') {
    return <VideoBubble url={signedUrl} />;
  }
  return <AudioBubble url={signedUrl} />;
}

function ImageBubble({
  url,
  attachment,
  onOpen,
}: {
  url: string;
  attachment: WorkMessageAttachment;
  onOpen: (storagePath: string) => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  if (errored) {
    return (
      <div className="flex aspect-video w-full max-w-xs items-center justify-center rounded-lg bg-gray-100 text-xs text-gray-500">
        <FileWarning className="mr-1.5 h-4 w-4" />
        Falha ao carregar imagem
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onOpen(attachment.storagePath)}
      className="group relative block w-full max-w-xs overflow-hidden rounded-lg bg-gray-100 outline-none focus-visible:ring-2 focus-visible:ring-[#64ABDE]"
      aria-label="Abrir imagem"
    >
      {!loaded && (
        <div className="flex aspect-video w-full items-center justify-center text-gray-300">
          <ImageIcon className="h-6 w-6 animate-pulse" />
        </div>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt="Anexo"
        loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={() => setErrored(true)}
        className={cn(
          'block w-full max-w-xs cursor-zoom-in object-cover transition-opacity',
          loaded ? 'opacity-100' : 'opacity-0',
          'max-h-[320px]',
        )}
      />
    </button>
  );
}

function VideoBubble({ url }: { url: string }) {
  return (
    <video
      src={url}
      controls
      preload="metadata"
      className="block w-full max-w-xs rounded-lg bg-black"
    >
      <track kind="captions" />
    </video>
  );
}

function AudioBubble({ url }: { url: string }) {
  return (
    <div className="rounded-lg bg-black/5 p-2">
      <audio src={url} controls preload="metadata" className="block w-full max-w-[280px]" />
    </div>
  );
}
