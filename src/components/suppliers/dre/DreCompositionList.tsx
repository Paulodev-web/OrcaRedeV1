import { dreGroupLabel } from '@/services/dre/types';
import type { DreResult } from '@/services/dre/types';

const currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const percentFormatter = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/**
 * Composição do custo realizado, como lista ranqueada — não donut.
 *
 * Um donut de 6 fatias precisaria de 6 cores mutuamente distinguíveis; a
 * paleta do sistema (croma baixo de propósito) não passa nisso em nenhum
 * nível testado. Uma lista com barra de UM hue só (proporcional ao valor) faz
 * o mesmo trabalho de leitura sem depender de cor para identidade — quem
 * carrega a identidade aqui é o rótulo do grupo, não a cor da barra.
 */
export function DreCompositionList({ result }: { result: DreResult }) {
  const totalRealizado = result.groups.reduce((acc, g) => acc + g.realizado, 0);

  const rows = [...result.groups]
    .filter((g) => g.realizado > 0)
    .sort((a, b) => b.realizado - a.realizado);

  return (
    <div className="rounded-2xl border border-gray-200 bg-surface p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-neutral-900">Composição do realizado</h3>

      {rows.length === 0 ? (
        <p className="mt-3 rounded-lg bg-gray-50 px-3 py-6 text-center text-xs text-gray-500">
          Nada lançado ainda — nem OC, nem custo manual.
        </p>
      ) : (
        <div className="mt-3 space-y-2.5">
          {rows.map((row) => {
            const pct = totalRealizado > 0 ? (row.realizado / totalRealizado) * 100 : 0;
            return (
              <div key={row.grupo}>
                <div className="flex items-baseline justify-between text-xs">
                  <span className="font-medium text-neutral-900">{dreGroupLabel(row.grupo)}</span>
                  <span className="text-gray-600">
                    {currencyFormatter.format(row.realizado)}{' '}
                    <span className="text-gray-400">({percentFormatter.format(pct)}%)</span>
                  </span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-100">
                  <div className="h-full rounded-full bg-accent-600" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
