'use client';

import { ImageOff, VideoOff, Volume2 } from 'lucide-react';

interface MediaFallbackProps {
  kind: 'image' | 'video' | 'audio';
  className?: string;
}

/**
 * Consistent fallback visual for broken/unavailable media.
 * Used by all media-rendering components when a signed URL fails.
 */
export function MediaFallback({ kind, className = '' }: MediaFallbackProps) {
  const config = FALLBACK_CONFIG[kind];
  const Icon = config.icon;

  return (
    <div
      className={`flex flex-col items-center justify-center gap-1.5 bg-gray-100 text-gray-400 ${className}`}
    >
      <Icon className="h-5 w-5" aria-hidden />
      <span className="text-[11px]">{config.label}</span>
    </div>
  );
}

const FALLBACK_CONFIG = {
  image: { icon: ImageOff, label: 'Mídia indisponível' },
  video: { icon: VideoOff, label: 'Vídeo indisponível' },
  audio: { icon: Volume2, label: 'Áudio indisponível' },
} as const;
