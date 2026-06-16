'use client';

import { useCallback, useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import type { GeneratePdfRequest, TableColumn, TableData } from '@/types/pdfExport';

function emptyTable(): TableData {
  return {
    title: '',
    columns: [
      { header: 'Coluna 1', weight: 1 },
      { header: 'Coluna 2', weight: 1 },
    ],
    rows: [['', '']],
  };
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

export function TableForm() {
  const [tables, setTables] = useState<TableData[]>([emptyTable()]);
  const [supplierName, setSupplierName] = useState('');
  const [supplierCnpj, setSupplierCnpj] = useState('');
  const [supplierPhone, setSupplierPhone] = useState('');
  const [supplierEmail, setSupplierEmail] = useState('');
  const [supplierAddress, setSupplierAddress] = useState('');
  const [supplierSalesContact, setSupplierSalesContact] = useState('');
  const [supplierPaymentTerms, setSupplierPaymentTerms] = useState('');
  const [metaSession, setMetaSession] = useState('');
  const [metaBudget, setMetaBudget] = useState('');
  const [metaExportedAt, setMetaExportedAt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateTable = useCallback((index: number, patch: Partial<TableData>) => {
    setTables((prev) =>
      prev.map((t, i) => (i === index ? { ...t, ...patch } : t))
    );
  }, []);

  const updateColumn = useCallback(
    (tableIndex: number, colIndex: number, patch: Partial<TableColumn>) => {
      setTables((prev) =>
        prev.map((t, i) => {
          if (i !== tableIndex) return t;
          const columns = t.columns.map((c, j) =>
            j === colIndex ? { ...c, ...patch } : c
          );
          return { ...t, columns };
        })
      );
    },
    []
  );

  const updateCell = useCallback(
    (tableIndex: number, rowIndex: number, colIndex: number, value: string) => {
      setTables((prev) =>
        prev.map((t, i) => {
          if (i !== tableIndex) return t;
          const rows = t.rows.map((row, r) =>
            r === rowIndex
              ? row.map((cell, c) => (c === colIndex ? value : cell))
              : row
          );
          return { ...t, rows };
        })
      );
    },
    []
  );

  const addTable = () => setTables((prev) => [...prev, emptyTable()]);
  const removeTable = (index: number) =>
    setTables((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));

  const addColumn = (tableIndex: number) => {
    setTables((prev) =>
      prev.map((t, i) => {
        if (i !== tableIndex) return t;
        const n = t.columns.length + 1;
        return {
          ...t,
          columns: [...t.columns, { header: `Coluna ${n}`, weight: 1 }],
          rows: t.rows.map((row) => [...row, '']),
        };
      })
    );
  };

  const removeColumn = (tableIndex: number, colIndex: number) => {
    setTables((prev) =>
      prev.map((t, i) => {
        if (i !== tableIndex || t.columns.length <= 1) return t;
        return {
          ...t,
          columns: t.columns.filter((_, j) => j !== colIndex),
          rows: t.rows.map((row) => row.filter((_, j) => j !== colIndex)),
        };
      })
    );
  };

  const addRow = (tableIndex: number) => {
    setTables((prev) =>
      prev.map((t, i) => {
        if (i !== tableIndex) return t;
        return {
          ...t,
          rows: [...t.rows, t.columns.map(() => '')],
        };
      })
    );
  };

  const removeRow = (tableIndex: number, rowIndex: number) => {
    setTables((prev) =>
      prev.map((t, i) => {
        if (i !== tableIndex || t.rows.length <= 1) return t;
        return { ...t, rows: t.rows.filter((_, r) => r !== rowIndex) };
      })
    );
  };

  const handleGenerate = async () => {
    setError(null);
    setIsGenerating(true);
    try {
      const payload: GeneratePdfRequest = {
        tables: tables.map((t) => ({
          title: t.title?.trim() || undefined,
          columns: t.columns,
          rows: t.rows,
        })),
      };

      if (supplierName.trim()) {
        payload.supplier = {
          name: supplierName.trim(),
          cnpj: supplierCnpj.trim() || null,
          phone: supplierPhone.trim() || null,
          email: supplierEmail.trim() || null,
          address: supplierAddress.trim() || null,
          salesContact: supplierSalesContact.trim() || null,
          paymentTerms: supplierPaymentTerms.trim() || null,
        };
      }

      if (metaSession.trim() || metaBudget.trim() || metaExportedAt.trim()) {
        payload.meta = {
          sessionTitle: metaSession.trim() || undefined,
          budgetLabel: metaBudget.trim() || undefined,
          exportedAt: metaExportedAt.trim() || undefined,
        };
      }

      const res = await fetch('/api/generate-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        let message = 'Não foi possível gerar o PDF.';
        try {
          const body = (await res.json()) as { error?: string };
          if (body.error) message = body.error;
        } catch {
          /* ignore */
        }
        setError(message);
        return;
      }

      const blob = await res.blob();
      downloadBlob(blob, 'documento.pdf');
    } catch {
      setError('Erro de rede ao gerar o PDF.');
    } finally {
      setIsGenerating(false);
    }
  };

  const inputClass =
    'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-[#64ABDE] focus:outline-none focus:ring-1 focus:ring-[#64ABDE]';

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-[#1D3140]">Gerador de PDF</h1>
        <p className="mt-1 text-sm text-gray-600">
          Monte tabelas e gere um PDF com o template da empresa.
        </p>
      </div>

      <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-medium text-[#1D3140]">Fornecedor (opcional)</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs font-medium text-gray-600">Nome</span>
            <input
              className={inputClass}
              value={supplierName}
              onChange={(e) => setSupplierName(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-600">CNPJ</span>
            <input className={inputClass} value={supplierCnpj} onChange={(e) => setSupplierCnpj(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-600">Telefone</span>
            <input className={inputClass} value={supplierPhone} onChange={(e) => setSupplierPhone(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-600">E-mail</span>
            <input className={inputClass} value={supplierEmail} onChange={(e) => setSupplierEmail(e.target.value)} />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs font-medium text-gray-600">Endereço</span>
            <input className={inputClass} value={supplierAddress} onChange={(e) => setSupplierAddress(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-600">Contato comercial</span>
            <input
              className={inputClass}
              value={supplierSalesContact}
              onChange={(e) => setSupplierSalesContact(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-600">Condições de pagamento</span>
            <input
              className={inputClass}
              value={supplierPaymentTerms}
              onChange={(e) => setSupplierPaymentTerms(e.target.value)}
            />
          </label>
        </div>
        <h3 className="text-sm font-medium text-gray-700">Metadados do orçamento</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-600">Sessão</span>
            <input className={inputClass} value={metaSession} onChange={(e) => setMetaSession(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-600">Orçamento</span>
            <input className={inputClass} value={metaBudget} onChange={(e) => setMetaBudget(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-600">Exportado em</span>
            <input
              className={inputClass}
              value={metaExportedAt}
              onChange={(e) => setMetaExportedAt(e.target.value)}
              placeholder="22/05/2026 14:30"
            />
          </label>
        </div>
      </section>

      {tables.map((table, tableIndex) => (
        <section
          key={tableIndex}
          className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-medium text-[#1D3140]">Tabela {tableIndex + 1}</h2>
            {tables.length > 1 && (
              <button
                type="button"
                onClick={() => removeTable(tableIndex)}
                className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4" />
                Remover tabela
              </button>
            )}
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-600">Título (opcional)</span>
            <input
              className={inputClass}
              value={table.title ?? ''}
              onChange={(e) => updateTable(tableIndex, { title: e.target.value })}
            />
          </label>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">Colunas</span>
              <button
                type="button"
                onClick={() => addColumn(tableIndex)}
                className="inline-flex items-center gap-1 text-sm text-[#1D3140] hover:underline"
              >
                <Plus className="h-4 w-4" />
                Coluna
              </button>
            </div>
            <div className="space-y-2">
              {table.columns.map((col, colIndex) => (
                <div key={colIndex} className="flex flex-wrap gap-2">
                  <input
                    className={`${inputClass} min-w-[140px] flex-1`}
                    value={col.header}
                    onChange={(e) =>
                      updateColumn(tableIndex, colIndex, { header: e.target.value })
                    }
                    placeholder="Cabeçalho"
                  />
                  <input
                    type="number"
                    min={0.1}
                    step={0.1}
                    className={`${inputClass} w-24`}
                    value={col.weight ?? 1}
                    onChange={(e) =>
                      updateColumn(tableIndex, colIndex, {
                        weight: Number(e.target.value) || 1,
                      })
                    }
                    title="Peso (largura proporcional)"
                  />
                  {table.columns.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeColumn(tableIndex, colIndex)}
                      className="rounded-lg border border-gray-200 px-2 py-2 text-gray-500 hover:bg-gray-50"
                      aria-label="Remover coluna"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] border-collapse text-sm">
              <thead>
                <tr className="bg-[#1D3140] text-left text-white">
                  {table.columns.map((col, i) => (
                    <th key={i} className="border border-[#2d4558] px-2 py-2 font-medium">
                      {col.header || `Col ${i + 1}`}
                    </th>
                  ))}
                  <th className="w-10 border border-[#2d4558]" />
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, rowIndex) => (
                  <tr
                    key={rowIndex}
                    className={rowIndex % 2 === 0 ? 'bg-[#f5f7fc]' : 'bg-white'}
                  >
                    {row.map((cell, colIndex) => (
                      <td key={colIndex} className="border border-gray-200 p-1">
                        <input
                          className="w-full min-w-[80px] rounded border-0 bg-transparent px-2 py-1 text-sm focus:ring-1 focus:ring-[#64ABDE]"
                          value={cell}
                          onChange={(e) =>
                            updateCell(tableIndex, rowIndex, colIndex, e.target.value)
                          }
                        />
                      </td>
                    ))}
                    <td className="border border-gray-200 p-1 text-center">
                      <button
                        type="button"
                        onClick={() => removeRow(tableIndex, rowIndex)}
                        disabled={table.rows.length <= 1}
                        className="text-gray-400 hover:text-red-600 disabled:opacity-30"
                        aria-label="Remover linha"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            type="button"
            onClick={() => addRow(tableIndex)}
            className="inline-flex items-center gap-1 text-sm text-[#1D3140] hover:underline"
          >
            <Plus className="h-4 w-4" />
            Linha
          </button>
        </section>
      ))}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={addTable}
          className="inline-flex items-center gap-2 rounded-lg border border-[#64ABDE] bg-white px-4 py-2 text-sm font-medium text-[#1D3140] hover:bg-[#64ABDE]/10"
        >
          <Plus className="h-4 w-4" />
          Nova tabela
        </button>
        <button
          type="button"
          onClick={() => void handleGenerate()}
          disabled={isGenerating}
          className="inline-flex items-center gap-2 rounded-lg bg-[#1D3140] px-5 py-2 text-sm font-medium text-white hover:bg-[#1D3140]/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isGenerating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : null}
          Gerar PDF
        </button>
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      )}
    </div>
  );
}
