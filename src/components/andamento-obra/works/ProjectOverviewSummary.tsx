import { FileText, Layers3, MapPin, Package } from 'lucide-react';
import type { WorkProjectSnapshotBundle } from '@/types/works';

interface ProjectOverviewSummaryProps {
  bundle: WorkProjectSnapshotBundle;
  /**
   * Quando `true`, o resumo e' renderizado compacto para caber na coluna
   * lateral da aba Visao Geral (canvas ocupa o espaco principal). Ajusta
   * grid de KPIs e tipografia.
   */
  compact?: boolean;
}

/**
 * Resumo leve do projeto importado, exibido na aba Visao Geral.
 *
 * Modos:
 *   - default: largura plena, KPIs em grade 4 colunas (lg)
 *   - compact: 2 colunas fixas, padding reduzido, sem aviso "Canvas
 *     visual sera exibido aqui em breve" (canvas ja esta presente)
 */
export function ProjectOverviewSummary({
  bundle,
  compact = false,
}: ProjectOverviewSummaryProps) {
  const { snapshot, posts, connections } = bundle;
  const meters = snapshot.metersPlanned;
  const totalMeters = meters.BT + meters.MT + meters.rede;
  const materialsCount = snapshot.materialsPlanned.length;
  const importedAt = formatDate(snapshot.importedAt);

  const containerClass = compact
    ? 'rounded-2xl border border-gray-200 bg-white p-4'
    : 'rounded-2xl border border-gray-200 bg-white p-5';

  const kpiGridClass = compact
    ? 'mt-3 grid grid-cols-2 gap-2'
    : 'mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4';

  return (
    <section className={containerClass}>
      <header className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold text-[#1D3140]">Projeto importado</h2>
        <span className="text-[11px] text-gray-500">Importado em {importedAt}</span>
      </header>
      <p className="mt-1 text-xs text-gray-500">
        Snapshot fixo do orçamento original. Alterações no orçamento não atualizam esta obra.
      </p>

      <ul className={kpiGridClass}>
        <SummaryCard
          icon={<MapPin className="h-3.5 w-3.5" />}
          label="Postes planejados"
          value={String(posts.length)}
          compact={compact}
        />
        <SummaryCard
          icon={<Layers3 className="h-3.5 w-3.5" />}
          label="Conexões"
          value={String(connections.length)}
          compact={compact}
        />
        <SummaryCard
          icon={<Package className="h-3.5 w-3.5" />}
          label="Materiais"
          value={String(materialsCount)}
          compact={compact}
        />
        <SummaryCard
          icon={<FileText className="h-3.5 w-3.5" />}
          label="PDF/planta"
          value={snapshot.pdfStoragePath ? 'Disponível' : 'Indisponível'}
          tone={snapshot.pdfStoragePath ? 'positive' : 'muted'}
          compact={compact}
        />
      </ul>

      <div
        className={
          compact
            ? 'mt-3 grid grid-cols-1 gap-1.5 text-xs text-gray-700'
            : 'mt-4 grid grid-cols-1 gap-2 text-xs text-gray-700 sm:grid-cols-3'
        }
      >
        <MetersRow label="BT" value={meters.BT} />
        <MetersRow label="MT" value={meters.MT} />
        <MetersRow label="Rede" value={meters.rede} />
      </div>
      {totalMeters === 0 && (
        <p className="mt-2 text-[11px] text-gray-500">
          Metragem planejada: <strong>0 m</strong> (não definida no orçamento).
        </p>
      )}

      {!compact && (
        <p className="mt-4 rounded-md border border-dashed border-gray-200 bg-gray-50 px-3 py-2 text-[11px] text-gray-500">
          Canvas visual será exibido aqui em breve.
        </p>
      )}
    </section>
  );
}

interface SummaryCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: 'default' | 'positive' | 'muted';
  compact?: boolean;
}

function SummaryCard({
  icon,
  label,
  value,
  tone = 'default',
  compact = false,
}: SummaryCardProps) {
  const valueClass =
    tone === 'positive'
      ? 'text-emerald-700'
      : tone === 'muted'
        ? 'text-gray-400'
        : 'text-[#1D3140]';
  return (
    <li
      className={
        compact
          ? 'rounded-lg border border-gray-200 bg-white p-2.5'
          : 'rounded-xl border border-gray-200 bg-white p-3'
      }
    >
      <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <p
        className={
          compact
            ? `mt-1 text-base font-bold ${valueClass}`
            : `mt-1 text-xl font-bold ${valueClass}`
        }
      >
        {value}
      </p>
    </li>
  );
}

function MetersRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5">
      <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{label}</span>
      <span className="font-semibold text-[#1D3140]">{value} m</span>
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
}
