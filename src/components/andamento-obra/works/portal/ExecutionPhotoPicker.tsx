'use client';

import { useState } from 'react';
import { getWorkExecutionPhotos, publishWorkExecutionPhoto } from '@/actions/workClientPortal';
import type { ExecutionPhoto, ExecutionPhotoKind } from '@/services/works/workExecutionPhotos';
import type { WorkPortalImage } from '@/services/works/getWorkClientPortal';
import { formatDateTimeBR } from '@/lib/formatDateTimeBR';

export function ExecutionPhotoPicker({ workId, images, onChange }: {
  workId: string;
  images: WorkPortalImage[];
  onChange: (images: WorkPortalImage[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<ExecutionPhotoKind>('pole');
  const [page, setPage] = useState(0);
  const [photos, setPhotos] = useState<ExecutionPhoto[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(nextKind: ExecutionPhotoKind, nextPage: number) {
    setBusy(true);
    setError(null);
    try {
      const result = await getWorkExecutionPhotos(workId, nextKind, nextPage);
      if (!result.success) { setError(result.error); return; }
      if (result.data) {
        setKind(nextKind);
        setPage(nextPage);
        setPhotos(result.data.photos);
        setHasMore(result.data.hasMore);
      }
    } catch {
      setError('Falha de conexão. Tente carregar as fotos novamente.');
    } finally { setBusy(false); }
  }

  async function publish(id: string) {
    setBusy(true);
    setError(null);
    try {
      const result = await publishWorkExecutionPhoto(workId, id);
      if (!result.success) setError(result.error);
      else if (result.data) onChange(result.data.images);
    } catch {
      setError('Falha de conexão. Confira a galeria antes de tentar novamente.');
    } finally { setBusy(false); }
  }

  return (
    <div className="mt-4 rounded-lg border border-gray-200 p-3">
      <button type="button" aria-expanded={open} aria-controls="execution-photo-picker"
        className="min-h-11 text-sm font-medium text-neutral-900" disabled={busy}
        onClick={() => { setOpen(!open); if (!open) void load(kind, page); }}>
        {open ? 'Fechar fotos da execução' : 'Escolher fotos do dia a dia'}
      </button>
      {open && <div id="execution-photo-picker" aria-busy={busy}>
        <p className="mb-3 text-xs text-gray-600">
          Somente as fotos que você publicar aparecerão para quem tiver o link do cliente.
          Observações internas não são publicadas. Remover da galeria encerra o acesso em até um minuto.
        </p>
        <label className="text-xs font-medium" htmlFor="execution-photo-source">Origem</label>
        <select id="execution-photo-source" value={kind} disabled={busy}
          className="ml-2 min-h-11 rounded border border-gray-300 px-2 text-sm"
          onChange={(event) => void load(event.target.value as ExecutionPhotoKind, 0)}>
          <option value="pole">Postes</option>
          <option value="equipment">Equipamentos</option>
        </select>
        {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
        {busy && <p role="status" className="mt-2 text-xs text-gray-600">Processando…</p>}
        {!busy && photos.length === 0 && !error && <p className="mt-3 text-sm text-gray-600">Nenhuma foto nesta origem.</p>}
        <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.map((photo) => {
            const published = images.some((image) => image.id === photo.id);
            return <li key={photo.id} className="rounded border border-gray-200 p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.previewUrl} alt="Foto da execução para publicação" loading="lazy"
                className="aspect-video w-full rounded object-cover" />
              <p className="mt-1 text-xs text-gray-600">{formatDateTimeBR(photo.createdAt)}</p>
              <button type="button" disabled={busy || published || images.length >= 30}
                onClick={() => void publish(photo.id)}
                className="mt-2 min-h-11 w-full rounded bg-neutral-900 px-2 text-xs font-medium text-white disabled:opacity-50">
                {published ? 'Já publicada' : 'Publicar para o cliente'}
              </button>
            </li>;
          })}
        </ul>
        <div className="mt-3 flex items-center gap-4 text-xs">
          <button type="button" disabled={busy || page === 0} className="min-h-11 disabled:opacity-40"
            onClick={() => void load(kind, page - 1)}>Anterior</button>
          <span>Página {page + 1}</span>
          <button type="button" disabled={busy || !hasMore} className="min-h-11 disabled:opacity-40"
            onClick={() => void load(kind, page + 1)}>Próxima</button>
          <button type="button" disabled={busy} className="min-h-11 disabled:opacity-40"
            onClick={() => void load(kind, page)}>Atualizar fotos</button>
        </div>
      </div>}
    </div>
  );
}
