"use client";

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { savePricingBudgetAction } from '@/actions/pricingBudgets';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import {
  calculateServicePricing,
  calcularValorServicoPorPercentual,
  calcularPercentualPorValorServico,
} from '@/lib/pricingMath';
import { consolidateMaterialsFromBudgetDetails } from '@/services/budgetMaterialAggregation';
import { BudgetImportSelect } from './BudgetImportSelect';
import { CostItemsTable } from './CostItemsTable';
import { ServicePricingSummary } from './ServicePricingSummary';
import { ServiceValueInput } from './ServiceValueInput';
import type { CostItem, PricingInputMode, PricingSaveMode, SavedPricingBudget } from './types';

interface PrecificacaoCalculatorProps {
  /**
   * Orçamento a precificar. Informado = modo embutido na esteira (§7.4): o select de
   * importação some e o id deixa de ser estado interno. Omitido = fluxo standalone de
   * `/tools/precificacao`, onde o usuário escolhe o orçamento na mão.
   */
  budgetId?: string;
  initialSaved?: SavedPricingBudget;
  /**
   * Chamado depois de salvar, no lugar do redirect para o dashboard — é assim que a
   * etapa 3 da esteira segue o fluxo sem sair da rota do orçamento.
   */
  onSaved?: (saved: SavedPricingBudget) => void;
}

function parseNonNegativeNumber(value: string): number {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return parsed;
}

function createCostItem(): CostItem {
  return {
    id: `${Date.now()}-${Math.round(Math.random() * 100000)}`,
    descricao: '',
    tipo: 'unitario',
    unidade: 0,
    valorUnitario: 0,
    pessoas: 0,
    dias: 0,
    percentual: 0,
    percentualBase: 'total',
    valor: 0,
  };
}

export function PrecificacaoCalculator({
  budgetId,
  initialSaved,
  onSaved,
}: PrecificacaoCalculatorProps) {
  const router = useRouter();
  const isEmbedded = budgetId !== undefined;
  const isEditMode = Boolean(initialSaved);
  const { user, loading: loadingAuth } = useAuth();
  const {
    budgets,
    folders,
    budgetDetails,
    loadingBudgets,
    loadingBudgetDetails,
    fetchBudgets,
    fetchFolders,
    fetchBudgetDetails,
  } = useApp();

  // Só serve ao select do modo standalone; embutido, o id vem sempre da prop.
  const [pickedBudgetId, setPickedBudgetId] = useState(() => initialSaved?.budgetId ?? '');
  const activeBudgetId = budgetId ?? pickedBudgetId;
  const [valorServicoInput, setValorServicoInput] = useState(() => initialSaved?.valorServicoInput ?? 0);
  const [percentMateriaisInput, setPercentMateriaisInput] = useState(
    () => initialSaved?.percentMateriaisInput ?? 0
  );
  const [pricingInputMode, setPricingInputMode] = useState<PricingInputMode>(
    () => initialSaved?.pricingInputMode ?? 'percentual'
  );
  const [costItems, setCostItems] = useState<CostItem[]>(() => initialSaved?.costItems ?? []);
  const [savingMode, setSavingMode] = useState<PricingSaveMode | null>(null);
  const [isExportingExcel, setIsExportingExcel] = useState(false);

  useEffect(() => {
    // A lista completa de orçamentos existe só para alimentar o select do standalone.
    if (!user || isEmbedded) {
      return;
    }

    fetchBudgets();
    fetchFolders();
  }, [fetchBudgets, fetchFolders, isEmbedded, user]);

  useEffect(() => {
    if (!activeBudgetId) {
      return;
    }

    fetchBudgetDetails(activeBudgetId);
  }, [fetchBudgetDetails, activeBudgetId]);

  // Os detalhes ficam num contexto compartilhado: enquanto não forem os do orçamento
  // ativo, os materiais consolidados não valem nada (e não podem ser salvos).
  const budgetDetailsLoaded = Boolean(activeBudgetId && budgetDetails?.id === activeBudgetId);

  const consolidatedMaterials = useMemo(() => {
    if (!budgetDetailsLoaded || !budgetDetails) {
      return [];
    }

    return consolidateMaterialsFromBudgetDetails(budgetDetails);
  }, [budgetDetails, budgetDetailsLoaded]);

  const valorMateriais = useMemo(
    () => consolidatedMaterials.reduce((acc, m) => acc + m.subtotal, 0),
    [consolidatedMaterials]
  );

  const { valorServico, percentMateriais } = useMemo(() => {
    if (pricingInputMode === 'percentual') {
      return {
        valorServico: calcularValorServicoPorPercentual(valorMateriais, percentMateriaisInput),
        percentMateriais: percentMateriaisInput,
      };
    }

    return {
      valorServico: valorServicoInput,
      percentMateriais: calcularPercentualPorValorServico(valorServicoInput, valorMateriais),
    };
  }, [pricingInputMode, valorServicoInput, percentMateriaisInput, valorMateriais]);

  const pricingResult = useMemo(
    () => calculateServicePricing(valorServico, costItems, 0, valorMateriais),
    [valorServico, costItems, valorMateriais]
  );

  const selectedBudget = useMemo(
    () => budgets.find((budget) => budget.id === activeBudgetId) ?? null,
    [budgets, activeBudgetId]
  );

  // Embutido não carrega a lista de orçamentos, então o nome vem dos detalhes.
  const selectedBudgetName =
    (budgetDetailsLoaded ? budgetDetails?.name : undefined) ??
    selectedBudget?.nome ??
    initialSaved?.budgetName ??
    '';

  // Salvar antes dos detalhes chegarem gravaria materiais vazios e VS zerado.
  const canPersistPricing = budgetDetailsLoaded;

  const handleValorServicoChange = (value: number) => {
    setValorServicoInput(parseNonNegativeNumber(String(value)));
    setPricingInputMode('valor');
  };

  const handlePercentMateriaisChange = (value: number) => {
    setPercentMateriaisInput(parseNonNegativeNumber(String(value)));
    setPricingInputMode('percentual');
  };

  const handleAddCostItem = () => {
    setCostItems((prev) => [...prev, createCostItem()]);
  };

  const handleUpdateCostItem = (id: string, patch: Partial<CostItem>) => {
    setCostItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch, id: item.id } : item))
    );
  };

  const handleRemoveCostItem = (id: string) => {
    setCostItems((prev) => prev.filter((item) => item.id !== id));
  };

  const buildPricingPayload = (saveMode: PricingSaveMode) => ({
    budgetId: activeBudgetId,
    budgetName: selectedBudgetName,
    clientName: budgetDetails?.client_name ?? selectedBudget?.clientName ?? null,
    city: budgetDetails?.city ?? selectedBudget?.city ?? null,
    saveMode,
    pricingInputMode,
    valorServicoInput,
    percentMateriaisInput,
    impostoPercent: 0,
    // Persiste os custos com o valor resolvido (inclusive percentuais) no momento do save.
    costItems: pricingResult.custosDetalhados.map(({ percentualDoVS: _percentualDoVS, ...item }) => item),
    materialsSnapshot: consolidatedMaterials,
    result: pricingResult,
  });

  const handleSavePricing = async (saveMode: PricingSaveMode) => {
    if (!canPersistPricing) {
      toast.error(
        activeBudgetId
          ? 'Aguarde os itens do orçamento carregarem antes de salvar.'
          : 'Selecione um orçamento antes de salvar a precificação.'
      );
      return;
    }

    setSavingMode(saveMode);
    const result = await savePricingBudgetAction(buildPricingPayload(saveMode));
    setSavingMode(null);

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    toast.success(isEditMode ? 'Precificação atualizada.' : 'Precificação salva.');

    if (onSaved) {
      onSaved(result.data.saved);
      return;
    }

    router.push('/tools/precificacao');
  };

  const handleExportExcel = async () => {
    if (!canPersistPricing) {
      toast.error(
        activeBudgetId
          ? 'Aguarde os itens do orçamento carregarem antes de exportar.'
          : 'Selecione um orçamento antes de exportar.'
      );
      return;
    }

    setIsExportingExcel(true);
    try {
      const response = await fetch('/api/pricing/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPricingPayload('snapshot')),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(data?.error || 'Erro ao gerar Excel.');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `precificacao-${selectedBudgetName || 'orcamento'}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success('Excel gerado com sucesso.');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao exportar Excel.';
      toast.error(message);
    } finally {
      setIsExportingExcel(false);
    }
  };

  if (loadingAuth) {
    return <div className="rounded-xl border border-gray-200 bg-surface p-6 text-sm text-gray-500">Verificando sessão...</div>;
  }

  if (!user) {
    return (
      <div className="rounded-xl border border-gray-200 bg-surface p-6 shadow-sm">
        <p className="text-sm text-gray-700">Faça login no portal principal para acessar o módulo de precificação.</p>
        <Link href="/" className="mt-3 inline-flex text-sm font-medium text-link hover:brightness-95">
          Ir para o portal
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Embutido na esteira, o chrome (breadcrumb + volta ao dashboard) é da rota do orçamento. */}
      {!isEmbedded && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs text-gray-400">
              <Link href="/" className="hover:text-link">
                Portal
              </Link>
              <span className="mx-1">/</span>
              <Link href="/tools/precificacao" className="hover:text-link">
                Módulo de Precificação
              </Link>
              <span className="mx-1">/</span>
              <span className="text-gray-600">{isEditMode ? 'Editar precificação' : 'Nova precificação'}</span>
            </p>
            <h1 className="mt-1 text-2xl font-bold text-neutral-900">
              {isEditMode ? 'Editar Precificação' : 'Nova Precificação'}
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              {isEditMode
                ? 'Altere o percentual ou os custos e salve para atualizar o card no dashboard.'
                : 'Vincule um orçamento, defina o percentual sobre os materiais, adicione custos e salve no dashboard.'}
              {selectedBudgetName ? ` Orçamento selecionado: ${selectedBudgetName}.` : ''}
            </p>
          </div>
          <Link
            href="/tools/precificacao"
            className="inline-flex h-10 items-center justify-center rounded-lg border border-accent-500/30 bg-surface px-4 text-sm font-medium text-neutral-900 shadow-sm transition hover:border-accent-500 hover:text-link"
          >
            Voltar ao dashboard
          </Link>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        <section className="space-y-4">
          {!isEmbedded && (
            <BudgetImportSelect
              budgets={budgets}
              folders={folders}
              selectedBudgetId={pickedBudgetId}
              loading={loadingBudgets}
              onBudgetChange={setPickedBudgetId}
            />
          )}

          <ServiceValueInput
            valorMateriais={valorMateriais}
            totalCustos={pricingResult.totalCustos}
            valorServico={valorServico}
            percentMateriais={percentMateriais}
            inputMode={pricingInputMode}
            onValorServicoChange={handleValorServicoChange}
            onPercentMateriaisChange={handlePercentMateriaisChange}
          />

          <CostItemsTable
            valorServico={valorServico}
            costItems={pricingResult.custosDetalhados}
            onAddCostItem={handleAddCostItem}
            onUpdateCostItem={handleUpdateCostItem}
            onRemoveCostItem={handleRemoveCostItem}
          />

          {activeBudgetId && !budgetDetailsLoaded && (
            <p className="text-xs text-gray-500">
              {loadingBudgetDetails
                ? 'Carregando itens do orçamento selecionado...'
                : 'Itens do orçamento ainda não carregados — salvar e exportar ficam bloqueados até chegarem.'}
            </p>
          )}
        </section>

        <ServicePricingSummary
          result={pricingResult}
          canSave={canPersistPricing}
          canExport={canPersistPricing}
          savingMode={savingMode}
          isExportingExcel={isExportingExcel}
          onSaveSnapshot={() => handleSavePricing('snapshot')}
          onSaveLive={() => handleSavePricing('live')}
          onExportExcel={handleExportExcel}
        />
      </div>
    </div>
  );
}
