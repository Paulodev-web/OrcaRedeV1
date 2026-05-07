import { MapPin } from 'lucide-react';

interface PostsProgressCardProps {
  postsPlanned: number;
  postsInstalled: number;
}

export function PostsProgressCard({ postsPlanned, postsInstalled }: PostsProgressCardProps) {
  const pct = postsPlanned > 0 ? Math.min(100, (postsInstalled / postsPlanned) * 100) : 0;
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <header className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
        <MapPin className="h-3.5 w-3.5" />
        Postes instalados
      </header>
      <p className="mt-2 text-2xl font-bold text-[#1D3140]">
        {postsInstalled} <span className="text-sm font-normal text-gray-400">/ {postsPlanned}</span>
      </p>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100">
        <div
          className="h-full bg-[#64ABDE] transition-all"
          style={{ width: `${pct.toFixed(1)}%` }}
        />
      </div>
      <p className="mt-2 text-[11px] text-gray-500">
        Atualização em tempo real disponível no Bloco 7 (instalação por poste).
      </p>
    </div>
  );
}
