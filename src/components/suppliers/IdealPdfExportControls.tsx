'use client';

import { useCallback, useEffect, useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import type { IdealExportSupplierOption } from '@/types/exportIdeal';

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
  onConfirmExport: (run: () => void | Promise<void>) => void;
}

export function IdealPdfExportControls({
  sessionId,
  canExport,
  onConfirmExport,
}: Props) {
  const [suppliers, setSuppliers] = useState<IdealExportSupplierOption[]>([]);
  const [selectedSlug, setSelectedSlug] = useState('');
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  useEffect(() => {
    if (!canExport) {
      setSuppliers([]);
      setSelectedSlug('');
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
            setListError('Não foi possível carregar fornecedores.');
            setSuppliers([]);
          }
          return;
        }
        const body = (await res.json()) as { suppliers?: IdealExportSupplierOption[] };
        if (cancelled) return;
        const list = body.suppliers ?? [];
        setSuppliers(list);
        setSelectedSlug((prev) =>
          list.some((s) => s.fileSlug === prev) ? prev : (list[0]?.fileSlug ?? '')
        );
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
  }, [sessionId, canExport]);

  const runPdfExport = useCallback(async () => {
    if (!selectedSlug || isExporting) return;
    setIsExporting(true);
    try {
      const res = await fetch(
        `/api/scenarios/export-ideal-pdf?sessionId=${encodeURIComponent(sessionId)}&supplierSlug=${encodeURIComponent(selectedSlug)}`
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
        `pedido-${selectedSlug}.pdf`;
      downloadBlob(blob, filename);
    } catch {
      alert('Erro de rede ao baixar o PDF. Tente novamente.');
    } finally {
      setIsExporting(false);
    }
  }, [sessionId, selectedSlug, isExporting]);

  const handleExportClick = () => {
    if (!canExport || isExporting || !selectedSlug) return;
    onConfirmExport(() => void runPdfExport());
  };

  const disabled =
    !canExport || isExporting || isLoadingList || !selectedSlug || suppliers.length === 0;

  return (
    <div className="inline-flex flex-wrap items-center gap-2">
      <select
        value={selectedSlug}
        onChange={(e) => setSelectedSlug(e.target.value)}
        disabled={!canExport || isLoadingList || suppliers.length === 0}
        className="max-w-[200px] rounded-lg border border-[#64ABDE] bg-white px-3 py-2 text-sm text-[#1D3140] disabled:cursor-not-allowed disabled:opacity-50 sm:max-w-[240px]"
        aria-label="Fornecedor para exportação PDF"
      >
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
          canExport
            ? 'PDF do pedido para o fornecedor selecionado'
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
