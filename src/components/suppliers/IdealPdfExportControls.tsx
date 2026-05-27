'use client';

import { useCallback, useEffect, useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import type { IdealExportSupplierOption } from '@/types/exportIdeal';

const ALL_SUPPLIERS_VALUE = 'all';

function parseContentDispositionFilename(header: string | null): string | null {
  if (!header) return null;
  const match = /filename\*?=(?:UTF-8''|")?([^";\n]+)/i.exec(header);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1].replace(/"/g, '').trim());
  } catch {
    return match[1].replace(/"/g, '').trim();
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.visibility = 'hidden';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

interface Props {
  sessionId: string;
  canExport: boolean;
  selectedSupplierSlug: string;
  onSelectedSupplierSlugChange: (slug: string) => void;
  onConfirmExport: (run: () => void | Promise<void>) => void;
}

export function IdealPdfExportControls({
  sessionId,
  canExport,
  selectedSupplierSlug,
  onSelectedSupplierSlugChange,
  onConfirmExport,
}: Props) {
  const [suppliers, setSuppliers] = useState<IdealExportSupplierOption[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  useEffect(() => {
    if (!canExport) {
      setSuppliers([]);
      onSelectedSupplierSlugChange(ALL_SUPPLIERS_VALUE);
      return;
    }

    let cancelled = false;
    setIsLoadingList(true);
    setListError(null);

    void (async () => {
      try {
        const res = await fetch(
          `/api/scenarios/export-ideal-suppliers?sessionId=${encodeURIComponent(sessionId)}`
        );
        if (!res.ok) {
          if (!cancelled) {
            let message = 'Não foi possível carregar fornecedores.';
            try {
              const body = (await res.json()) as { error?: string };
              if (body.error) message = body.error;
            } catch {
              /* ignore */
            }
            setListError(message);
            setSuppliers([]);
          }
          return;
        }
        const body = (await res.json()) as { suppliers?: IdealExportSupplierOption[] };
        if (cancelled) return;
        const list = body.suppliers ?? [];
        setSuppliers(list);
        if (
          selectedSupplierSlug !== ALL_SUPPLIERS_VALUE &&
          !list.some((s) => s.fileSlug === selectedSupplierSlug)
        ) {
          onSelectedSupplierSlugChange(ALL_SUPPLIERS_VALUE);
        }
      } catch {
        if (!cancelled) {
          setListError('Erro de rede ao carregar fornecedores.');
          setSuppliers([]);
        }
      } finally {
        if (!cancelled) setIsLoadingList(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sessionId, canExport, selectedSupplierSlug, onSelectedSupplierSlugChange]);

  const runPdfExport = useCallback(async () => {
    if (
      !selectedSupplierSlug ||
      selectedSupplierSlug === ALL_SUPPLIERS_VALUE ||
      isExporting
    ) {
      return;
    }
    setIsExporting(true);
    try {
      const res = await fetch(
        `/api/scenarios/export-ideal-pdf?sessionId=${encodeURIComponent(sessionId)}&supplierSlug=${encodeURIComponent(selectedSupplierSlug)}`
      );
      if (!res.ok) {
        let message = 'Não foi possível gerar o PDF.';
        try {
          const body = (await res.json()) as { error?: string };
          if (body.error) message = body.error;
        } catch {
          /* ignore */
        }
        alert(message);
        return;
      }
      const blob = await res.blob();
      const filename =
        parseContentDispositionFilename(res.headers.get('Content-Disposition')) ??
        `pedido-${selectedSupplierSlug}.pdf`;
      downloadBlob(blob, filename);
    } catch {
      alert('Erro de rede ao baixar o PDF. Tente novamente.');
    } finally {
      setIsExporting(false);
    }
  }, [sessionId, selectedSupplierSlug, isExporting]);

  const handleExportClick = () => {
    if (
      !canExport ||
      isExporting ||
      !selectedSupplierSlug ||
      selectedSupplierSlug === ALL_SUPPLIERS_VALUE
    ) {
      return;
    }
    onConfirmExport(() => void runPdfExport());
  };

  const disabled =
    !canExport ||
    isExporting ||
    isLoadingList ||
    !selectedSupplierSlug ||
    selectedSupplierSlug === ALL_SUPPLIERS_VALUE ||
    suppliers.length === 0;

  return (
    <div className="inline-flex flex-wrap items-center gap-2">
      <select
        value={selectedSupplierSlug}
        onChange={(e) => onSelectedSupplierSlugChange(e.target.value)}
        disabled={!canExport || isLoadingList || suppliers.length === 0}
        className="max-w-[200px] rounded-lg border border-[#64ABDE] bg-white px-3 py-2 text-sm text-[#1D3140] disabled:cursor-not-allowed disabled:opacity-50 sm:max-w-[240px]"
        aria-label="Filtrar Cenário Ideal por fornecedor"
      >
        <option value={ALL_SUPPLIERS_VALUE}>Todos</option>
        {isLoadingList && <option value="">Carregando…</option>}
        {!isLoadingList && suppliers.length === 0 && (
          <option value="">Sem fornecedores</option>
        )}
        {suppliers.map((s) => (
          <option key={s.fileSlug} value={s.fileSlug}>
            {s.supplierName}
          </option>
        ))}
      </select>
      <span
        title={
          canExport && selectedSupplierSlug !== ALL_SUPPLIERS_VALUE
            ? 'PDF do pedido para o fornecedor selecionado'
            : selectedSupplierSlug === ALL_SUPPLIERS_VALUE
              ? 'Escolha um fornecedor específico para exportar PDF'
            : 'Nenhum material com necessidade de compra'
        }
        className="inline-flex"
      >
        <button
          type="button"
          onClick={handleExportClick}
          disabled={disabled}
          className="inline-flex items-center gap-2 rounded-lg border border-[#64ABDE] bg-white px-4 py-2 text-sm font-medium text-[#1D3140] transition-colors hover:bg-[#64ABDE]/10 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white"
        >
          {isExporting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FileText className="h-4 w-4" />
          )}
          Exportar PDF
        </button>
      </span>
      {listError && (
        <span className="text-xs text-red-600" title={listError}>
          Lista indisponível
        </span>
      )}
    </div>
  );
}
