'use client';

import { memo } from 'react';
import type { WorkPoleInstallation } from '@/types/works';

/**
 * Tamanho efetivo do pin de execucao em pixels logicos.
 *
 * Decisao do plano (Bloco 7): pin de instalacao deve ser visualmente distinto
 * do `WorkPostMarker` (planejado) em mais de uma dimensao - cor, formato e
 * tamanho. Assim, em zoom afastado / mobile / usuario daltonico, ainda da
 * pra distinguir "planejado" de "executado".
 *
 *  - Planejado: circulo cinza, ~24px
 *  - Instalacao: gota ambar ou verde, ~32px (44px area de toque)
 */
const PIN_WIDTH = 24;
const PIN_HEIGHT = 32;
/** Area de toque minima em mobile (44px). */
const TOUCH_TARGET = 44;

/**
 * As duas caras do pin de execucao.
 *
 * Ambar = levantado em campo, esperando o engenheiro. Verde = publicado, o
 * cliente ja ve. Nao e cor inventada aqui: e o mesmo par que `DailyLogStatusBadge`
 * e `MilestoneStatusBadge` usam para `pending_approval` e `approved`. Quem
 * aprende o codigo de cor no diario le a planta sem precisar de legenda.
 *
 * Alem da cor, o tracejado no contorno carrega a mesma informacao, para
 * sobreviver a zoom afastado, tela no sol e daltonismo.
 */
const APARENCIA = {
  aguardando: {
    fill: '#F59E0B',
    stroke: '#B45309',
    strokeSelecionado: '#92400E',
    tracejado: '3 2',
    halo: 'rgba(245,158,11,0.6)',
  },
  publicado: {
    fill: '#10B981',
    stroke: '#047857',
    strokeSelecionado: '#065F46',
    tracejado: undefined,
    halo: 'rgba(16,185,129,0.6)',
  },
} as const;

interface WorkInstallationPinProps {
  installation: WorkPoleInstallation;
  selected: boolean;
  onSelect: (installation: WorkPoleInstallation) => void;
  /** Nome do gerente para tooltip (opcional). */
  creatorName?: string | null;
}

/**
 * Pin de execucao no `WorkCanvas`.
 *
 * Renderizado sobre o PDF, na coordenada (x_coord, y_coord) do espaco logico
 * 6000x6000. Diferenciado do `WorkPostMarker` por:
 *  - cor viva (ambar ou verde) contra o cinza do poste previsto
 *  - formato de gota invertida (SVG)
 *  - tamanho ligeiramente maior + area de toque 44px (mobile-friendly)
 *
 * Tres estados na mesma planta, cada um com forma e cor propria:
 *  - cinza redondo: previsto no orcamento, campo ainda nao chegou
 *  - gota ambar tracejada: levantado em campo, esperando o engenheiro publicar
 *  - gota verde inteira: publicado, o cliente ja ve no portal
 *
 * `React.memo` para reduzir re-render durante pan/zoom (igual WorkPostMarker).
 *
 * Tooltip nativo (`title`): em mobile/touch nao funciona; o click direto abre
 * o painel sem preview - aceito como dividua de UX.
 */
export const WorkInstallationPin = memo(function WorkInstallationPin({
  installation,
  selected,
  onSelect,
  creatorName,
}: WorkInstallationPinProps) {
  const label = installation.numbering?.trim()
    ? installation.numbering
    : 'Sem numeracao';

  const installedDate = formatShort(installation.installedAt);
  const base = creatorName
    ? `Instalado em ${installedDate} por ${creatorName}`
    : `Instalado em ${installedDate}`;

  const published = installation.approvedAt !== null;
  const cor = published ? APARENCIA.publicado : APARENCIA.aguardando;
  const tooltip = published
    ? `${base}. Publicado no portal do cliente.`
    : `${base}. Aguardando sua aprovacao para aparecer no portal do cliente.`;

  // z-index por installed_at: instalacoes mais recentes ficam por cima.
  // Convertemos timestamp em segundos desde epoch / 1000 para caber em
  // valores razoaveis de z-index. Selecionado sempre acima.
  const baseZ = Math.floor(
    new Date(installation.installedAt).getTime() / 1000 / 1000,
  );
  const zIndex = selected ? 999 : 70 + (Number.isFinite(baseZ) ? baseZ : 0);

  return (
    <button
      type="button"
      onClick={() => onSelect(installation)}
      title={tooltip}
      aria-label={`Pin de instalacao ${label}. ${tooltip}`}
      data-installation-id={installation.id}
      className="absolute flex items-center justify-center bg-transparent p-0 transition-transform duration-150 ease-out hover:scale-110 focus:outline-none focus-visible:scale-110"
      style={{
        left: `${installation.xCoord - TOUCH_TARGET / 2}px`,
        top: `${installation.yCoord - PIN_HEIGHT}px`,
        width: `${TOUCH_TARGET}px`,
        height: `${TOUCH_TARGET}px`,
        zIndex,
      }}
    >
      <svg
        width={PIN_WIDTH}
        height={PIN_HEIGHT}
        viewBox="0 0 24 32"
        aria-hidden="true"
        style={{
          filter: selected
            ? `drop-shadow(0 0 4px ${cor.halo})`
            : 'drop-shadow(0 1px 1px rgba(0,0,0,0.25))',
        }}
      >
        {/* Forma de gota: ponta inferior em (12, 32), corpo arredondado em
            cima. Path desenhado em coordenadas SVG locais. */}
        <path
          d="M12 0 C5 0 0 5 0 12 C0 19 5 24 12 32 C19 24 24 19 24 12 C24 5 19 0 12 0 Z"
          fill={cor.fill}
          stroke={selected ? cor.strokeSelecionado : cor.stroke}
          strokeWidth={selected ? 2.5 : published ? 1.5 : 2}
          strokeDasharray={cor.tracejado}
        />
        <circle cx={12} cy={12} r={4.5} fill="#FFFFFF" />
      </svg>
    </button>
  );
});

function formatShort(iso: string): string {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return '-';
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const hh = String(dt.getHours()).padStart(2, '0');
  const min = String(dt.getMinutes()).padStart(2, '0');
  return `${dd}/${mm} ${hh}:${min}`;
}
