import { TrendingUp } from 'lucide-react';
import type { SCurveDataPoint } from '@/types/works';

interface SCurveChartProps {
  data: SCurveDataPoint[];
  totalPlanned: number;
  startedAt: string | null;
  expectedEndAt: string | null;
}

const PADDING = { top: 16, right: 16, bottom: 28, left: 44 };
const WIDTH = 720;
const HEIGHT = 240;

/**
 * Curva-S em SVG puro. Eixo X: dias da obra. Eixo Y: metros cumulativos.
 *
 * Linha cinza tracejada = planejado (linear).
 * Barras azuis = realizado cumulativo por dia.
 *
 * Fallbacks:
 *  - sem started_at: mensagem
 *  - data vazia: eixos vazios + label
 */
export function SCurveChart({ data, totalPlanned, startedAt, expectedEndAt }: SCurveChartProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <header className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          <TrendingUp className="h-3.5 w-3.5" />
          Curva S — planejado vs realizado
        </h3>
        <Legend />
      </header>

      <div className="mt-3">
        {!startedAt ? (
          <Placeholder text="Defina a data de início da obra para visualizar progresso temporal." />
        ) : data.length === 0 ? (
          <Placeholder text="Obra ainda não iniciada — sem dados a exibir." />
        ) : (
          <SvgChart data={data} totalPlanned={totalPlanned} expectedEndAt={expectedEndAt} />
        )}
      </div>
    </div>
  );
}

function Placeholder({ text }: { text: string }) {
  return (
    <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50 text-center text-xs text-gray-500">
      <p className="px-4">{text}</p>
    </div>
  );
}

function Legend() {
  return (
    <div className="flex items-center gap-3 text-[11px] text-gray-500">
      <span className="inline-flex items-center gap-1">
        <span className="inline-block h-0.5 w-4 border-t border-dashed border-gray-400" />
        Planejado
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="inline-block h-2 w-2 rounded-sm bg-[#64ABDE]" />
        Realizado
      </span>
    </div>
  );
}

function SvgChart({
  data,
  totalPlanned,
  expectedEndAt,
}: {
  data: SCurveDataPoint[];
  totalPlanned: number;
  expectedEndAt: string | null;
}) {
  const innerW = WIDTH - PADDING.left - PADDING.right;
  const innerH = HEIGHT - PADDING.top - PADDING.bottom;

  const maxY = Math.max(
    1, // evita divisao por zero
    totalPlanned,
    ...data.map((d) => Math.max(d.plannedCumulative, d.realizedCumulative)),
  );
  const xStep = data.length > 1 ? innerW / (data.length - 1) : 0;
  const barW = data.length > 0 ? Math.max(2, Math.min(12, innerW / data.length / 1.5)) : 4;

  const plannedPath = data
    .map((d, i) => {
      const x = PADDING.left + i * xStep;
      const y = PADDING.top + innerH - (d.plannedCumulative / maxY) * innerH;
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');

  // Eixo Y: 4 ticks
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((p) => ({
    value: maxY * p,
    y: PADDING.top + innerH - innerH * p,
  }));

  // Eixo X: marca primeiro, ultimo, e expected_end (se cabe)
  const firstDate = data[0]?.date;
  const lastDate = data[data.length - 1]?.date;

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label="Curva S de progresso"
      className="w-full"
    >
      {/* Grid horizontal */}
      {yTicks.map((t, i) => (
        <line
          key={i}
          x1={PADDING.left}
          x2={WIDTH - PADDING.right}
          y1={t.y}
          y2={t.y}
          stroke="#e5e7eb"
          strokeWidth={1}
        />
      ))}
      {/* Eixos */}
      <line
        x1={PADDING.left}
        x2={PADDING.left}
        y1={PADDING.top}
        y2={HEIGHT - PADDING.bottom}
        stroke="#9ca3af"
        strokeWidth={1}
      />
      <line
        x1={PADDING.left}
        x2={WIDTH - PADDING.right}
        y1={HEIGHT - PADDING.bottom}
        y2={HEIGHT - PADDING.bottom}
        stroke="#9ca3af"
        strokeWidth={1}
      />

      {/* Y labels */}
      {yTicks.map((t, i) => (
        <text
          key={`yt-${i}`}
          x={PADDING.left - 6}
          y={t.y}
          fontSize="10"
          textAnchor="end"
          dominantBaseline="middle"
          fill="#6b7280"
        >
          {formatMeters(t.value)}
        </text>
      ))}

      {/* Bars */}
      {data.map((d, i) => {
        const x = PADDING.left + i * xStep - barW / 2;
        const h = (d.realizedCumulative / maxY) * innerH;
        const y = PADDING.top + innerH - h;
        if (d.realizedCumulative === 0) return null;
        return (
          <rect
            key={`b-${i}`}
            x={x}
            y={y}
            width={barW}
            height={Math.max(0, h)}
            fill="#64ABDE"
            opacity={0.85}
          />
        );
      })}

      {/* Planned line (dashed) */}
      <path
        d={plannedPath}
        fill="none"
        stroke="#9ca3af"
        strokeWidth={1.5}
        strokeDasharray="4 4"
      />

      {/* X labels: first, expected_end (if matches), last */}
      {firstDate && (
        <text
          x={PADDING.left}
          y={HEIGHT - PADDING.bottom + 14}
          fontSize="10"
          textAnchor="start"
          fill="#6b7280"
        >
          {formatDate(firstDate)}
        </text>
      )}
      {lastDate && (
        <text
          x={WIDTH - PADDING.right}
          y={HEIGHT - PADDING.bottom + 14}
          fontSize="10"
          textAnchor="end"
          fill="#6b7280"
        >
          {formatDate(lastDate)}
        </text>
      )}
      {expectedEndAt && firstDate && lastDate
        && expectedEndAt > firstDate && expectedEndAt <= lastDate && (
          <ExpectedEndMarker
            firstDate={firstDate}
            lastDate={lastDate}
            expectedEndAt={expectedEndAt}
            innerW={innerW}
          />
        )}
    </svg>
  );
}

function ExpectedEndMarker({
  firstDate,
  lastDate,
  expectedEndAt,
  innerW,
}: {
  firstDate: string;
  lastDate: string;
  expectedEndAt: string;
  innerW: number;
}) {
  const start = parseDate(firstDate)?.getTime() ?? 0;
  const end = parseDate(lastDate)?.getTime() ?? 0;
  const target = parseDate(expectedEndAt)?.getTime() ?? 0;
  if (end <= start || target < start || target > end) return null;
  const fraction = (target - start) / (end - start);
  const x = PADDING.left + fraction * innerW;
  return (
    <g>
      <line
        x1={x}
        x2={x}
        y1={PADDING.top}
        y2={HEIGHT - PADDING.bottom}
        stroke="#f59e0b"
        strokeWidth={1}
        strokeDasharray="2 2"
      />
      <text
        x={x}
        y={PADDING.top - 4}
        fontSize="9"
        textAnchor="middle"
        fill="#b45309"
      >
        previsto
      </text>
    </g>
  );
}

function formatMeters(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return v.toFixed(0);
}

function formatDate(s: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return s;
  return `${m[3]}/${m[2]}`;
}

function parseDate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}
