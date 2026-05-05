"use client";

import {
  Eye,
  EyeOff,
  Layers3,
  RotateCcw,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

interface CanvasToolbarProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  showPdf: boolean;
  onTogglePdf: () => void;
  showProject: boolean;
  onToggleProject: () => void;
  /** Se a obra tem PDF disponivel. Se false, o toggle PDF fica desabilitado. */
  hasPdf: boolean;
  /** Se a obra tem postes/conexoes. Se false, o toggle de projeto fica desabilitado. */
  hasProject: boolean;
  /** Indicador de carregamento do PDF (desabilita controles). */
  isLoading?: boolean;
}

/**
 * Toolbar do `WorkCanvas` (read-only).
 *
 * Controles disponiveis:
 *   - Zoom out / Recentrar / Zoom in
 *   - Toggle "Mostrar PDF" (desabilitado se nao ha PDF)
 *   - Toggle "Mostrar projeto" (desabilitado se nao ha postes/conexoes)
 *
 * Ausentes (vs CanvasVisual): upload, exclusao, modo conexao (azul/verde),
 * edicao de postes/conexoes. Todas operacoes destrutivas/edicao sao
 * incompativeis com o snapshot imutavel do Andamento de Obra.
 *
 * Responsivo: rotulos textuais escondem em telas <768px (apenas icones).
 */
export function CanvasToolbar({
  onZoomIn,
  onZoomOut,
  onReset,
  showPdf,
  onTogglePdf,
  showProject,
  onToggleProject,
  hasPdf,
  hasProject,
  isLoading = false,
}: CanvasToolbarProps) {
  return (
    <div
      className="flex flex-wrap items-center gap-2 border-b border-gray-200 bg-gray-50 px-3 py-2"
      role="toolbar"
      aria-label="Controles do canvas"
    >
      <div className="flex items-center overflow-hidden rounded-md border border-gray-300 bg-white">
        <ToolbarIconButton
          aria-label="Diminuir zoom"
          title="Diminuir zoom"
          onClick={onZoomOut}
          disabled={isLoading}
          className="border-r border-gray-300"
        >
          <ZoomOut className="h-3.5 w-3.5" />
        </ToolbarIconButton>
        <ToolbarIconButton
          aria-label="Recentrar canvas"
          title="Recentrar canvas"
          onClick={onReset}
          disabled={isLoading}
          className="border-r border-gray-300"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </ToolbarIconButton>
        <ToolbarIconButton
          aria-label="Aumentar zoom"
          title="Aumentar zoom"
          onClick={onZoomIn}
          disabled={isLoading}
        >
          <ZoomIn className="h-3.5 w-3.5" />
        </ToolbarIconButton>
      </div>

      <ToolbarToggle
        active={showPdf}
        disabled={!hasPdf || isLoading}
        onClick={onTogglePdf}
        title={
          !hasPdf
            ? 'Esta obra não tem PDF importado'
            : showPdf
              ? 'Ocultar PDF do projeto'
              : 'Mostrar PDF do projeto'
        }
        ariaLabel={showPdf ? 'Ocultar PDF' : 'Mostrar PDF'}
        icon={
          showPdf ? (
            <EyeOff className="h-3.5 w-3.5" />
          ) : (
            <Eye className="h-3.5 w-3.5" />
          )
        }
        label={showPdf ? 'Ocultar PDF' : 'Mostrar PDF'}
      />

      <ToolbarToggle
        active={showProject}
        disabled={!hasProject || isLoading}
        onClick={onToggleProject}
        title={
          !hasProject
            ? 'Esta obra não tem postes ou conexões planejadas'
            : showProject
              ? 'Ocultar postes e conexões do projeto'
              : 'Mostrar postes e conexões do projeto'
        }
        ariaLabel={showProject ? 'Ocultar projeto' : 'Mostrar projeto'}
        icon={<Layers3 className="h-3.5 w-3.5" />}
        label={showProject ? 'Ocultar projeto' : 'Mostrar projeto'}
      />
    </div>
  );
}

interface ToolbarIconButtonProps {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title: string;
  className?: string;
  'aria-label': string;
}

function ToolbarIconButton({
  children,
  onClick,
  disabled,
  title,
  className = '',
  'aria-label': ariaLabel,
}: ToolbarIconButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      className={`p-1.5 text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 ${className}`.trim()}
    >
      {children}
    </button>
  );
}

interface ToolbarToggleProps {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  title: string;
  ariaLabel: string;
  icon: React.ReactNode;
  label: string;
}

function ToolbarToggle({
  active,
  disabled,
  onClick,
  title,
  ariaLabel,
  icon,
  label,
}: ToolbarToggleProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      aria-pressed={active}
      className={[
        'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-50',
        active
          ? 'border-[#1D3140] bg-[#1D3140] text-white hover:bg-[#16242F]'
          : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100',
      ].join(' ')}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
