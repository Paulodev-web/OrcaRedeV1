'use client';

import React, { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowRight,
  ChevronDown,
  FileText,
  Loader2,
  RotateCcw,
  Save,
  Upload,
} from 'lucide-react';
import { extractSupplierDataAction, type SupplierItem } from '@/actions/supplierIngestion';
import { createSupplierQuoteAction, runAutoMatchAction } from '@/actions/supplierQuotes';
import { supabase } from '@/lib/supabaseClient';
import type { BudgetOption } from '@/types';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const formatNumber = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

interface Props {
  budgets: BudgetOption[];
}

export default function SupplierPdfImporter({ budgets }: Props) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Campos obrigatórios antes do upload
  const [selectedBudgetId, setSelectedBudgetId] = useState<string>('');
  const [supplierName, setSupplierName] = useState<string>('');

  // Upload e extração
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pdfPath, setPdfPath] = useState<string | null>(null);
  const [items, setItems] = useState<SupplierItem[] | null>(null);
  const [observacoes, setObservacoes] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Salvamento final
  const [isSaving, setIsSaving] = useState(false);

  const canUpload = selectedBudgetId !== '' && supplierName.trim() !== '';
  const alertCount = items?.filter((item) => item.alerta).length ?? 0;
  const selectedBudgetName = budgets.find((b) => b.id === selectedBudgetId)?.name;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);
    setError(null);
  };

  const handleProcess = () => {
    if (!selectedFile || !canUpload) return;
    setError(null);

    startTransition(async () => {
      console.log('[SupplierPdfImporter] Antes do upload', {
        nome: selectedFile.name,
        tamanhoBytes: selectedFile.size,
      });

      const filePath = `fornecedores/${Date.now()}_${selectedFile.name}`;

      const { data, error: uploadError } = await supabase.storage
        .from('fornecedores_pdfs')
        .upload(filePath, selectedFile, { upsert: true });

      if (uploadError || !data) {
        console.error('[SupplierPdfImporter] Upload Supabase falhou', uploadError);
        setError(`Falha no upload: ${uploadError?.message ?? 'erro desconhecido'}`);
        return;
      }

      console.log('[SupplierPdfImporter] Upload OK, path:', data.path);
      setPdfPath(data.path);

      const result = await extractSupplierDataAction({ filePath: data.path });

      console.log('[SupplierPdfImporter] Resultado da Server Action:', result);

      if (result.success) {
        setItems(result.items);
        setObservacoes(result.observacoesGerais);
      } else {
        setError(result.error);
      }
    });
  };

  const handleSaveQuote = async () => {
    if (!items || !pdfPath || !selectedBudgetId || !supplierName.trim()) return;

    setIsSaving(true);
    setError(null);

    try {
      // 1. Persiste cotação + itens no banco
      const createResult = await createSupplierQuoteAction({
        budget_id: selectedBudgetId,
        supplier_name: supplierName.trim(),
        pdf_path: pdfPath,
        observacoes_gerais: observacoes ?? '',
        items,
      });

      if (!createResult.success) {
        setError(createResult.error);
        setIsSaving(false);
        return;
      }

      const { quoteId } = createResult.data;

      // 2. Roda auto-match contra a memória De/Para (falhas não bloqueiam a navegação)
      await runAutoMatchAction(quoteId).catch((err) => {
        console.warn('[SupplierPdfImporter] Auto-match falhou (não bloqueante):', err);
      });

      // 3. Abre a aba Conciliar na mesma página
      router.push(
        `/fornecedores?tab=conciliar&quoteId=${encodeURIComponent(quoteId)}`
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao salvar cotação.';
      setError(message);
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    setPdfPath(null);
    setItems(null);
    setObservacoes(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="flex flex-col gap-6 h-full">
      {/* ------------------------------------------------------------------ */}
      {/* Header                                                              */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Importar Proposta de Fornecedor</h1>
          <p className="text-sm text-gray-500 mt-1">
            Faça upload de um orçamento em PDF para extrair, revisar e salvar os itens automaticamente.
          </p>
        </div>
        {items && (
          <button
            onClick={handleReset}
            className="flex items-center gap-2 px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
          >
            <RotateCcw className="h-4 w-4" />
            <span>Novo Upload</span>
          </button>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Banner de erro                                                      */}
      {/* ------------------------------------------------------------------ */}
      {error && (
        <div className="flex items-start justify-between p-4 bg-red-50 border border-red-200 rounded-lg flex-shrink-0">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-red-400 hover:text-red-600 ml-4 text-sm"
          >
            ✕
          </button>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Formulário de contexto: orçamento + fornecedor                      */}
      {/* ------------------------------------------------------------------ */}
      <div className="bg-white rounded-lg shadow flex-shrink-0">
        <div className="p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">
            1. Contexto da cotação
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Select de orçamento */}
            <div>
              <label
                htmlFor="budget-select"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Orçamento / Obra <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <select
                  id="budget-select"
                  value={selectedBudgetId}
                  onChange={(e) => setSelectedBudgetId(e.target.value)}
                  disabled={!!items || isPending}
                  className="w-full appearance-none rounded-lg border border-gray-300 bg-white py-2.5 pl-3 pr-10 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed"
                >
                  <option value="">Selecione o orçamento...</option>
                  {budgets.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              </div>
            </div>

            {/* Input de nome do fornecedor */}
            <div>
              <label
                htmlFor="supplier-name"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Nome do Fornecedor <span className="text-red-500">*</span>
              </label>
              <input
                id="supplier-name"
                type="text"
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                placeholder="Ex.: Eletromar Distribuidora"
                disabled={!!items || isPending}
                className="w-full rounded-lg border border-gray-300 bg-white py-2.5 px-3 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed"
              />
            </div>
          </div>

          {/* Indicador quando já está bloqueado (review mode) */}
          {items && selectedBudgetName && (
            <p className="mt-3 text-xs text-gray-500">
              Proposta vinculada a:{' '}
              <span className="font-medium text-gray-700">{selectedBudgetName}</span>
              {' — '}
              Fornecedor:{' '}
              <span className="font-medium text-gray-700">{supplierName}</span>
            </p>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Bloco de upload — oculto após extração                             */}
      {/* ------------------------------------------------------------------ */}
      {!items && (
        <div className="bg-white rounded-lg shadow flex-shrink-0">
          <div className="p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4">2. Arquivo PDF</h2>

            {/* Zona de drop */}
            <label
              htmlFor="pdf-upload"
              className={[
                'flex flex-col items-center justify-center w-full h-40 border-2 border-dashed rounded-lg transition-colors',
                canUpload
                  ? selectedFile
                    ? 'border-blue-400 bg-blue-50 cursor-pointer'
                    : 'border-gray-300 bg-gray-50 hover:bg-gray-100 hover:border-gray-400 cursor-pointer'
                  : 'border-gray-200 bg-gray-50 cursor-not-allowed opacity-60',
              ].join(' ')}
            >
              {selectedFile ? (
                <div className="flex flex-col items-center gap-2">
                  <FileText className="h-10 w-10 text-blue-500" />
                  <p className="text-sm font-medium text-blue-700">{selectedFile.name}</p>
                  <p className="text-xs text-blue-500">
                    {(selectedFile.size / 1024).toFixed(1)} KB
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Upload className="h-10 w-10 text-gray-400" />
                  <p className="text-sm font-medium text-gray-600">
                    {canUpload
                      ? 'Clique para selecionar ou arraste o PDF aqui'
                      : 'Preencha o orçamento e o fornecedor primeiro'}
                  </p>
                  <p className="text-xs text-gray-400">Somente arquivos .pdf</p>
                </div>
              )}
              <input
                id="pdf-upload"
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                onChange={handleFileChange}
                disabled={!canUpload || isPending}
              />
            </label>

            {/* Ações */}
            <div className="flex items-center justify-end gap-3 mt-4">
              {selectedFile && !isPending && (
                <button
                  type="button"
                  onClick={handleReset}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
                >
                  Limpar
                </button>
              )}
              <button
                type="button"
                onClick={handleProcess}
                disabled={!selectedFile || !canUpload || isPending}
                className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Lendo PDF e processando com IA...</span>
                  </>
                ) : (
                  <>
                    <FileText className="h-4 w-4" />
                    <span>Processar PDF</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Tabela de revisão + botão de salvar                                */}
      {/* ------------------------------------------------------------------ */}
      {items && (
        <div className="bg-white rounded-lg shadow flex-1 flex flex-col overflow-hidden">
          {/* Cabeçalho da tabela */}
          <div className="p-4 border-b flex items-center justify-between flex-shrink-0">
            <div>
              <h2 className="text-base font-semibold text-gray-900">
                3. Revisão dos itens extraídos
              </h2>
              <p className="text-sm text-gray-500 mt-0.5">
                {items.length} {items.length === 1 ? 'item encontrado' : 'itens encontrados'}
                {alertCount > 0 && (
                  <span className="ml-2 inline-flex items-center gap-1 text-amber-600 font-medium">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    <span>
                      {alertCount}{' '}
                      {alertCount === 1 ? 'inconsistência detectada' : 'inconsistências detectadas'}
                    </span>
                  </span>
                )}
              </p>
            </div>
            {alertCount > 0 && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-700">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                <span>Linhas marcadas possuem qtd × preço ≠ total</span>
              </div>
            )}
          </div>

          {/* Observações gerais */}
          {observacoes && observacoes.trim().length > 0 && (
            <div className="px-4 pb-4 flex-shrink-0 border-b border-gray-100">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 mt-3">
                <h3 className="text-sm font-semibold text-gray-900 mb-2">
                  Observações do orçamento
                </h3>
                <div className="text-sm text-gray-800 whitespace-pre-wrap">{observacoes}</div>
              </div>
            </div>
          )}

          {/* Tabela rolável */}
          <div className="flex-1 overflow-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-3 w-8" />
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Descrição
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-24">
                    Unidade
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-28">
                    Quantidade
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-36">
                    Preço Unit.
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-36">
                    Total
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-20">
                    IPI %
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-20">
                    ST
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {items.map((item, index) => (
                  <tr
                    key={index}
                    className={
                      item.alerta
                        ? 'bg-amber-50 hover:bg-amber-100 transition-colors'
                        : 'hover:bg-gray-50 transition-colors'
                    }
                  >
                    <td className="px-4 py-3 text-center">
                      {item.alerta && (
                        <AlertTriangle
                          className="h-4 w-4 text-red-500 mx-auto"
                          aria-label="Qtd × Preço Unit. ≠ Total"
                        />
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 max-w-xs">
                      <span className="line-clamp-2" title={item.descricao}>
                        {item.descricao}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                      {item.unidade}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 text-right whitespace-nowrap">
                      {formatNumber(item.quantidade)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 text-right whitespace-nowrap">
                      {formatCurrency(item.preco_unit)}
                    </td>
                    <td
                      className={`px-4 py-3 text-sm font-medium text-right whitespace-nowrap ${
                        item.alerta ? 'text-red-600' : 'text-gray-900'
                      }`}
                    >
                      {formatCurrency(item.total_item)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 text-right whitespace-nowrap">
                      {item.ipi_percent > 0 ? `${formatNumber(item.ipi_percent)}%` : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-center">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          item.st_incluso
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {item.st_incluso ? 'Sim' : 'Não'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Footer: total + botão de salvar */}
          <div className="border-t bg-gray-50 px-6 py-4 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-6 text-sm">
              <span className="text-gray-500">Total geral:</span>
              <span className="font-semibold text-gray-900">
                {formatCurrency(items.reduce((acc, item) => acc + item.total_item, 0))}
              </span>
            </div>

            <button
              type="button"
              onClick={handleSaveQuote}
              disabled={isSaving}
              className="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Salvando...</span>
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  <span>Salvar Cotação e Iniciar Conciliação</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
