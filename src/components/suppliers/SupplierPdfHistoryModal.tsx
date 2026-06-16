'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ExternalLink, FileText, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  getSupplierPdfSignedUrlAction,
  listSupplierPdfHistoryAction,
} from '@/actions/suppliers';
import type { SupplierPdfHistoryItem } from '@/services/suppliers/listSupplierPdfHistory';
import type { Supplier } from '@/types';

const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const d = iso.length === 10 ? new Date(`${iso}T12:00:00`) : new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
};

const fmtDateTime = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

function statusLabel(item: SupplierPdfHistoryItem): string {
  if (item.job_status === 'pending') return 'Aguardando';
  if (item.job_status === 'processing') return 'Processando';
  if (item.job_status === 'error') return 'Erro';
  if (item.job_status === 'quote_only') return 'Importado';
  if (item.quote_status === 'conciliado') return 'Conciliado';
  if (item.quote_status === 'aprovado') return 'Aprovado';
  if (item.extraction_validated_at) return 'Extraído';
  return 'Processado';
}

function statusClass(item: SupplierPdfHistoryItem): string {
  if (item.job_status === 'error') {
    return 'bg-red-100 text-red-800';
  }
  if (item.job_status === 'pending' || item.job_status === 'processing') {
    return 'bg-amber-100 text-amber-900';
  }
  if (item.quote_status === 'conciliado' || item.quote_status === 'aprovado') {
    return 'bg-emerald-100 text-emerald-800';
  }
  return 'bg-slate-100 text-slate-700';
}

interface Props {
  supplier: Supplier | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function SupplierPdfHistoryBody({ supplierId }: { supplierId: string }) {
  const [items, setItems] = useState<SupplierPdfHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openingPath, setOpeningPath] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listSupplierPdfHistoryAction(supplierId).then((res) => {
      if (cancelled) return;
      setLoading(false);
      if (res.success) {
        setItems(res.data);
        setError(null);
      } else {
        setError(res.error);
        setItems([]);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [supplierId]);

  const handleOpenPdf = async (filePath: string) => {
    setOpeningPath(filePath);
    const res = await getSupplierPdfSignedUrlAction(filePath);
    setOpeningPath(null);
    if (res.success) {
      window.open(res.data.url, '_blank', 'noopener,noreferrer');
    } else {
      setError(res.error);
    }
  };

  return (
    <div className="flex-1 overflow-auto px-1">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-12 text-gray-500">
              <Loader2 className="h-5 w-5 animate-spin" />
              Carregando histórico…
            </div>
          )}

          {error && !loading && (
            <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          {!loading && !error && items.length === 0 && (
            <p className="py-10 text-center text-sm text-gray-500">
              Nenhum PDF vinculado a este fornecedor ainda.
            </p>
          )}

          {!loading && items.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    <th className="px-3 py-2">PDF / orçamento</th>
                    <th className="px-3 py-2">Upload</th>
                    <th className="px-3 py-2">Data cotação</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2 text-right">Itens</th>
                    <th className="px-3 py-2 text-right">Total</th>
                    <th className="px-3 py-2 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {items.map((item) => (
                    <tr key={`${item.extraction_job_id ?? 'q'}-${item.quote_id ?? item.id}`}>
                      <td className="px-3 py-3">
                        <div className="flex items-start gap-2">
                          <FileText className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                          <span className="font-medium text-[#1D3140]">{item.label}</span>
                        </div>
                        {item.error_message && (
                          <p className="mt-1 text-xs text-red-600">{item.error_message}</p>
                        )}
                      </td>
                      <td className="px-3 py-3 text-gray-600">{fmtDateTime(item.uploaded_at)}</td>
                      <td className="px-3 py-3 text-gray-600">{fmtDate(item.quote_date)}</td>
                      <td className="px-3 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusClass(item)}`}
                        >
                          {statusLabel(item)}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right text-gray-600">
                        {item.item_count > 0 ? item.item_count : '—'}
                      </td>
                      <td className="px-3 py-3 text-right text-gray-600">
                        {item.quote_total > 0 ? fmtCurrency(item.quote_total) : '—'}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            disabled={openingPath === item.file_path}
                            onClick={() => void handleOpenPdf(item.file_path)}
                            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                          >
                            {openingPath === item.file_path ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <ExternalLink className="h-3 w-3" />
                            )}
                            PDF
                          </button>
                          {item.session_id && (
                            <Link
                              href={`/fornecedores/sessao/${item.session_id}`}
                              className="inline-flex items-center gap-1 rounded-lg border border-[#64ABDE]/40 px-2 py-1 text-xs font-medium text-[#1D3140] hover:bg-[#64ABDE]/10"
                            >
                              Sessão
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
    </div>
  );
}

export default function SupplierPdfHistoryModal({ supplier, open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Histórico de PDFs — {supplier?.name ?? ''}</DialogTitle>
          <DialogDescription>
            Cotações e uploads vinculados a este fornecedor, com data de envio e data da cotação no
            documento.
          </DialogDescription>
        </DialogHeader>

        {open && supplier ? <SupplierPdfHistoryBody key={supplier.id} supplierId={supplier.id} /> : null}
      </DialogContent>
    </Dialog>
  );
}
