'use client';

import { useMemo, useState } from 'react';
import {
  GALLERY_ITEMS_LIMIT,
  type GalleryItem,
} from '@/types/works';
import { ImageLightbox } from '../shared/ImageLightbox';
import { GalleryEmptyState } from './GalleryEmptyState';
import { GalleryFilters, type GalleryFiltersValue } from './GalleryFilters';
import { GalleryItemView } from './GalleryItem';

interface GalleryViewProps {
  items: GalleryItem[];
  /** True quando o servidor cortou a lista no LIMIT (200). */
  truncated: boolean;
}

export function GalleryView({ items, truncated }: GalleryViewProps) {
  const [filters, setFilters] = useState<GalleryFiltersValue>({
    kind: 'all',
    source: 'all',
    month: null,
  });
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const monthOptions = useMemo(() => {
    const set = new Set<string>();
    for (const it of items) {
      const ym = it.createdAt.slice(0, 7);
      if (ym.length === 7) set.add(ym);
    }
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [items]);

  const filtered = useMemo(() => {
    return items.filter((it) => {
      if (filters.kind !== 'all' && it.kind !== filters.kind) return false;
      if (filters.source !== 'all' && it.source !== filters.source) return false;
      if (filters.month && !it.createdAt.startsWith(filters.month)) return false;
      return true;
    });
  }, [items, filters]);

  // Lightbox so navega entre imagens visiveis com URL valido.
  const filteredImages = useMemo(
    () =>
      filtered
        .filter((it) => it.kind === 'image' && it.signedUrl)
        .map((it) => it.signedUrl as string),
    [filtered],
  );

  const filteredImageIds = useMemo(
    () =>
      filtered
        .filter((it) => it.kind === 'image' && it.signedUrl)
        .map((it) => it.id),
    [filtered],
  );

  function openImageById(itemId: string) {
    const idx = filteredImageIds.indexOf(itemId);
    if (idx >= 0) setLightboxIndex(idx);
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-[#1D3140]">Galeria</h1>
          <p className="text-xs text-gray-500">
            Mídias unificadas de chat, diário, marcos e instalações.
            Ordenadas pela data de envio.
          </p>
        </div>
        <p className="text-[11px] text-gray-400">
          {filtered.length} de {items.length} itens
          {truncated && ` (mostrando ${GALLERY_ITEMS_LIMIT} mais recentes)`}
        </p>
      </header>

      {truncated && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
          Exibindo os {GALLERY_ITEMS_LIMIT} itens mais recentes.
          Itens anteriores serão carregados com paginação em versão futura.
        </div>
      )}

      <GalleryFilters
        value={filters}
        onChange={setFilters}
        monthOptions={monthOptions}
      />

      {filtered.length === 0 ? (
        <GalleryEmptyState />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filtered.map((item) => (
            <GalleryItemView
              key={item.id}
              item={item}
              onOpenImage={() => openImageById(item.id)}
            />
          ))}
        </div>
      )}

      <ImageLightbox
        open={lightboxIndex !== null}
        onOpenChange={(o) => !o && setLightboxIndex(null)}
        images={filteredImages}
        initialIndex={lightboxIndex ?? 0}
        alt="Mídia da obra"
      />
    </div>
  );
}
