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
import { TaxInput } from './TaxInput';
import type { CostItem, PricingInputMode, PricingSaveMode, SavedPricingBudget } from './types';

interface PrecificacaoCalculatorProps {
  initialSaved?: SavedPricingBudget;
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

export function PrecificacaoCalculator({ initialSaved }: PrecificacaoCalculatorProps) {
  const router = useRouter();
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

  const [selectedBudgetId, setSelectedBudgetId] = useState(() => initialSaved?.budgetId ?? '');
  const [valorServicoInput, setValorServicoInput] = useState(() => initialSaved?.valorServicoInput ?? 0);
  const [percentMateriaisInput, setPercentMateriaisInput] = useState(
    () => initialSaved?.percentMateriaisInput ?? 0
  );
  const [pricingInputMode, setPricingInputMode] = useState<PricingInputMode>(
    () => initialSaved?.pricingInputMode ?? 'percentual'
  );
  const [costItems, setCostItems] = useState<CostItem[]>(() => initialSaved?.costItems ?? []);
  const [impostoPercent, setImpostoPercent] = useState(() => initialSaved?.impostoPercent ?? 0);
  const [savingMode, setSavingMode] = useState<PricingSaveMode | null>(null);
  const [isExportingExcel, setIsExportingExcel] = useState(false);

  useEffect(() => {
    if (!user) {
      return;
    }

    fetchBudgets();
    fetchFolders();
  }, [fetchBudgets, fetchFolders, user]);

  useEffect(() => {
    if (!selectedBudgetId) {
      return;
    }

    fetchBudgetDetails(selectedBudgetId);
  }, [fetchBudgetDetails, selectedBudgetId]);

  const consolidatedMaterials = useMemo(() => {
    if (!selectedBudgetId || !budgetDetails || budgetDetails.id !== selectedBudgetId) {
      return [];
    }

    return consolidateMaterialsFromBudgetDetails(budgetDetails);
  }, [budgetDetails, selectedBudgetId]);

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
    () => calculateServicePricing(valorServico, costItems, impostoPercent, valorMateriais),
    [valorServico, costItems, impostoPercent, valorMateriais]
  );

  const selectedBudget = useMemo(
    () => budgets.find((budget) => budget.id === selectedBudgetId) ?? null,
    [budgets, selectedBudgetId]
  );

  const selectedBudgetName = selectedBudget?.nome ?? '';
  const canPersistPricing = Boolean(selectedBudgetId && selectedBudgetName);

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

  const handleImpostoChange = (value: number) => {
    setImpostoPercent(parseNonNegativeNumber(String(value)));
  };

  const buildPricingPayload = (saveMode: PricingSaveMode) => ({
    budgetId: selectedBudgetId,
    budgetName: selectedBudgetName,
    clientName: budgetDetails?.client_name ?? selectedBudget?.clientName ?? null,
    city: budgetDetails?.city ?? selectedBudget?.city ?? null,
    saveMode,
    pricingInputMode,
    valorServicoInput,
    percentMateriaisInput,
    impostoPercent,
    // Persiste os custos com o valor resolvido (inclusive percentuais) no momento do save.
    costItems: pricingResult.custosDetalhados.map(({ percentualDoVS: _percentualDoVS, ...item }) => item),
    materialsSnapshot: consolidatedMaterials,
    result: pricingResult,
  });

  const handleSavePricing = async (saveMode: PricingSaveMode) => {
    if (!canPersistPricing) {
      toast.error('Selecione um orçamento antes de salvar a precificação.');
      return;
    }

    setSavingMode(saveMode);
    const result = await savePricingBudgetAction(buildPricingPayload(saveMode));
    setSavingMode(null);

    if (result.success) {
      toast.success(
        isEditMode ? 'Precificação atualizada no dashboard.' : 'Precificação salva no dashboard.'
      );
      router.push('/tools/precificacao');
      return;
    }

    toast.error(result.error);
  };

  const handleExportExcel = async () => {
    if (!canPersistPricing) {
      toast.error('Selecione um orçamento antes de exportar.');
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
    return <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">Verificando sessão...</div>;
  }

  if (!user) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-gray-700">Faça login no portal principal para acessar o módulo de precificação.</p>
        <Link href="/" className="mt-3 inline-flex text-sm font-medium text-[#64ABDE] hover:brightness-95">
          Ir para o portal
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
        <p className="text-xs text-gray-400">
          <Link href="/" className="hover:text-[#64ABDE]">
            Portal
          </Link>
          <span className="mx-1">/</span>
          <Link href="/tools/precificacao" className="hover:text-[#64ABDE]">
            Módulo de Precificação
          </Link>
          <span className="mx-1">/</span>
          <span className="text-gray-600">{isEditMode ? 'Editar precificação' : 'Nova precificação'}</span>
        </p>
        <h1 className="mt-1 text-2xl font-bold text-[#1D3140]">
          {isEditMode ? 'Editar Precificação' : 'Nova Precificação'}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {isEditMode
            ? 'Altere o percentual, custos ou impostos e salve para atualizar o card no dashboard.'
            : 'Vincule um orçamento, defina o percentual sobre os materiais, adicione custos e salve no dashboard.'}
          {selectedBudgetName ? ` Orçamento selecionado: ${selectedBudgetName}.` : ''}
        </p>
        </div>
        <Link
          href="/tools/precificacao"
          className="inline-flex h-10 items-center justify-center rounded-lg border border-[#64ABDE]/30 bg-white px-4 text-sm font-medium text-[#1D3140] shadow-sm transition hover:border-[#64ABDE] hover:text-[#64ABDE]"
        >
          Voltar ao dashboard
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        <section className="space-y-4">
          <BudgetImportSelect
            budgets={budgets}
            folders={folders}
            selectedBudgetId={selectedBudgetId}
            loading={loadingBudgets}
            onBudgetChange={setSelectedBudgetId}
          />

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

          {loadingBudgetDetails && selectedBudgetId && (
            <p className="text-xs text-gray-500">Carregando itens do orçamento selecionado...</p>
          )}

          <TaxInput impostoPercent={impostoPercent} onChange={handleImpostoChange} />
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
