'use client';

interface CanvasLegendProps {
  /** Quantos postes do projeto o campo ainda não encostou. */
  previstos: number;
  /** Levantados em campo, esperando o engenheiro publicar. */
  aguardando: number;
  /** Publicados: o cliente já vê no portal. */
  publicados: number;
}

/**
 * Legenda dos três estados de poste na planta.
 *
 * Passou a existir quando o pin de execução ganhou duas caras. Com uma cor só,
 * a planta se explicava sozinha; com âmbar e verde convivendo, quem abre a tela
 * pela primeira vez precisa saber qual é qual, e a diferença entre "o campo
 * levantou" e "o cliente já vê" é justamente a que não pode ficar ambígua.
 *
 * As contagens vão junto porque a pergunta que vem logo depois de "qual cor é
 * qual" é sempre "quantos faltam".
 */
export function CanvasLegend({
  previstos,
  aguardando,
  publicados,
}: CanvasLegendProps) {
  return (
    <ul
      className="pointer-events-none absolute bottom-3 left-3 z-[60] flex flex-col gap-1 rounded-lg border border-gray-200 bg-surface/95 px-2.5 py-2 text-[11px] shadow-sm backdrop-blur-[2px]"
      aria-label="Legenda dos postes na planta"
    >
      <Item
        rotulo="Previsto no projeto"
        quantidade={previstos}
        marcador={
          <span className="h-2.5 w-2.5 rounded-full border-2 border-gray-500 bg-gray-400" />
        }
      />
      <Item
        rotulo="Aguardando sua aprovação"
        quantidade={aguardando}
        marcador={<Gota fill="#F59E0B" stroke="#B45309" tracejado />}
      />
      <Item
        rotulo="Publicado para o cliente"
        quantidade={publicados}
        marcador={<Gota fill="#10B981" stroke="#047857" />}
      />
    </ul>
  );
}

function Item({
  rotulo,
  quantidade,
  marcador,
}: {
  rotulo: string;
  quantidade: number;
  marcador: React.ReactNode;
}) {
  return (
    <li className="flex items-center gap-1.5 text-gray-700">
      <span className="flex h-3 w-3 shrink-0 items-center justify-center">
        {marcador}
      </span>
      <span>{rotulo}</span>
      <span className="ml-auto pl-2 font-semibold tabular-nums text-neutral-900">
        {quantidade}
      </span>
    </li>
  );
}

function Gota({
  fill,
  stroke,
  tracejado = false,
}: {
  fill: string;
  stroke: string;
  tracejado?: boolean;
}) {
  return (
    <svg width={9} height={12} viewBox="0 0 24 32" aria-hidden="true">
      <path
        d="M12 0 C5 0 0 5 0 12 C0 19 5 24 12 32 C19 24 24 19 24 12 C24 5 19 0 12 0 Z"
        fill={fill}
        stroke={stroke}
        strokeWidth={3}
        strokeDasharray={tracejado ? '5 4' : undefined}
      />
    </svg>
  );
}
