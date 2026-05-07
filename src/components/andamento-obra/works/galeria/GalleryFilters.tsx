'use client';

import type {
  GalleryItemKind,
  GalleryItemSource,
} from '@/types/works';

export interface GalleryFiltersValue {
  kind: GalleryItemKind | 'all';
  source: GalleryItemSource | 'all';
  /** YYYY-MM ou null. */
  month: string | null;
}

interface GalleryFiltersProps {
  value: GalleryFiltersValue;
  onChange: (v: GalleryFiltersValue) => void;
  monthOptions: string[];
}

const SOURCE_LABEL: Record<GalleryItemSource | 'all', string> = {
  all: 'Todas as origens',
  chat: 'Chat',
  daily_log: 'Diário',
  milestone: 'Marcos',
  installation: 'Instalações',
  checklist_item: 'Checklists',
  alert: 'Alertas',
};

const KIND_LABEL: Record<GalleryItemKind | 'all', string> = {
  all: 'Todos os tipos',
  image: 'Imagens',
  video: 'Vídeos',
  audio: 'Áudios',
};

export function GalleryFilters({
  value,
  onChange,
  monthOptions,
}: GalleryFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white p-3">
      <Select
        label="Origem"
        value={value.source}
        onChange={(v) =>
          onChange({ ...value, source: v as GalleryItemSource | 'all' })
        }
        options={[
          { value: 'all', label: SOURCE_LABEL.all },
          { value: 'chat', label: SOURCE_LABEL.chat },
          { value: 'daily_log', label: SOURCE_LABEL.daily_log },
          { value: 'milestone', label: SOURCE_LABEL.milestone },
          { value: 'installation', label: SOURCE_LABEL.installation },
        ]}
      />
      <Select
        label="Tipo"
        value={value.kind}
        onChange={(v) =>
          onChange({ ...value, kind: v as GalleryItemKind | 'all' })
        }
        options={[
          { value: 'all', label: KIND_LABEL.all },
          { value: 'image', label: KIND_LABEL.image },
          { value: 'video', label: KIND_LABEL.video },
          { value: 'audio', label: KIND_LABEL.audio },
        ]}
      />
      <Select
        label="Mês"
        value={value.month ?? 'all'}
        onChange={(v) =>
          onChange({ ...value, month: v === 'all' ? null : v })
        }
        options={[
          { value: 'all', label: 'Todos os meses' },
          ...monthOptions.map((m) => ({ value: m, label: formatMonth(m) })),
        ]}
      />
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-gray-600">
      <span>{label}:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-[#1D3140] focus:border-[#1D3140] focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function formatMonth(ym: string): string {
  const [year, month] = ym.split('-');
  if (!year || !month) return ym;
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}
