import { Images } from 'lucide-react';

export function GalleryEmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-gray-200 bg-white p-8 text-center">
      <Images className="mx-auto h-8 w-8 text-gray-400" />
      <p className="mt-2 text-sm font-medium text-[#1D3140]">
        Sem mídias na obra ainda.
      </p>
      <p className="mt-1 text-xs text-gray-500">
        Fotos e vídeos enviados em chat, diário, marcos e instalações
        aparecerão aqui.
      </p>
    </div>
  );
}
