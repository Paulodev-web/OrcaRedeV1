"use client";

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import {
  calculateServicePricing,
  calcularValorServicoPorLucro,
  calcularLucroPorValorServico,
} from '@/lib/pricingMath';
import { consolidateMaterialsFromBudgetDetails } from '@/services/budgetMaterialAggregation';
import { BudgetImportSelect } from './BudgetImportSelect';
import { CostItemsTable } from './CostItemsTable';
import { ServicePricingSummary } from './ServicePricingSummary';
import { ServiceValueInput } from './ServiceValueInput';
import { TaxInput } from './TaxInput';
import type { CostItem, PricingInputMode } from './types';

function parseNonNegativeNumber(value: string): number {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return parsed;
}

function parsePercent(value: string): number {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  if (parsed < 0) return 0;
  return parsed;
}

function createCostItem(): CostItem {
  return {
    id: `${Date.now()}-${Math.round(Math.random() * 100000)}`,
    descricao: '',
    valor: 0,
  };
}

export function PrecificacaoCalculator() {
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

  const [selectedBudgetId, setSelectedBudgetId] = useState('');
  const [valorServicoInput, setValorServicoInput] = useState(0);
  const [lucroPercentInput, setLucroPercentInput] = useState(0);
  const [pricingInputMode, setPricingInputMode] = useState<PricingInputMode>('valor');
  const [costItems, setCostItems] = useState<CostItem[]>([]);
  const [impostoPercent, setImpostoPercent] = useState(0);

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

  const valorMateriais = useMemo(() => {
    if (!selectedBudgetId || !budgetDetails || budgetDetails.id !== selectedBudgetId) {
      return 0;
    }

    const consolidatedMaterials = consolidateMaterialsFromBudgetDetails(budgetDetails);
    return consolidatedMaterials.reduce((acc, m) => acc + m.subtotal, 0);
  }, [budgetDetails, selectedBudgetId]);

  const totalCustos = useMemo(
    () => costItems.reduce((acc, item) => acc + item.valor, 0),
    [costItems]
  );

  const { valorServico, lucroPercent } = useMemo(() => {
    if (pricingInputMode === 'valor') {
      const derivedLucro = calcularLucroPorValorServico(valorServicoInput, totalCustos);
      return { valorServico: valorServicoInput, lucroPercent: derivedLucro };
    }

    const derivedVS = calcularValorServicoPorLucro(totalCustos, lucroPercentInput);
    return {
      valorServico: derivedVS ?? 0,
      lucroPercent: lucroPercentInput,
    };
  }, [pricingInputMode, valorServicoInput, lucroPercentInput, totalCustos]);

  const pricingResult = useMemo(
    () => calculateServicePricing(valorServico, costItems, impostoPercent, valorMateriais),
    [valorServico, costItems, impostoPercent, valorMateriais]
  );

  const selectedBudgetName = useMemo(
    () => budgets.find((budget) => budget.id === selectedBudgetId)?.nome ?? '',
    [budgets, selectedBudgetId]
  );

  const handleValorServicoChange = (value: string) => {
    const novoValor = parseNonNegativeNumber(value);
    setValorServicoInput(novoValor);
    setPricingInputMode('valor');
  };

  const handleLucroPercentChange = (value: string) => {
    const novoLucro = parsePercent(value);
    setLucroPercentInput(novoLucro);
    setPricingInputMode('lucro');
  };

  const handleAddCostItem = () => {
    setCostItems((prev) => [...prev, createCostItem()]);
  };

  const handleUpdateCostItem = (id: string, field: 'descricao' | 'valor', value: string) => {
    setCostItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) {
          return item;
        }

        if (field === 'valor') {
          return { ...item, valor: parseNonNegativeNumber(value) };
        }

        return { ...item, descricao: value };
      })
    );
  };

  const handleRemoveCostItem = (id: string) => {
    setCostItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleImpostoChange = (value: string) => {
    setImpostoPercent(parsePercent(value));
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
      <div>
        <p className="text-xs text-gray-400">
          <Link href="/" className="hover:text-[#64ABDE]">
            Portal
          </Link>
          <span className="mx-1">/</span>
          <span className="text-gray-600">Módulo de Precificação</span>
        </p>
        <h1 className="mt-1 text-2xl font-bold text-[#1D3140]">Módulo de Precificação</h1>
        <p className="mt-1 text-sm text-gray-500">
          Precificação de serviços: defina o valor ou lucro desejado, adicione custos e calcule o total ao cliente.
          {selectedBudgetName ? ` Orçamento selecionado: ${selectedBudgetName}.` : ''}
        </p>
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
            totalCustos={totalCustos}
            valorServico={valorServico}
            lucroPercent={lucroPercent}
            inputMode={pricingInputMode}
            onValorServicoChange={handleValorServicoChange}
            onLucroPercentChange={handleLucroPercentChange}
          />

          <CostItemsTable
            valorServico={valorServico}
            costItems={costItems}
            onAddCostItem={handleAddCostItem}
            onUpdateCostItem={handleUpdateCostItem}
            onRemoveCostItem={handleRemoveCostItem}
          />

          {loadingBudgetDetails && selectedBudgetId && (
            <p className="text-xs text-gray-500">Carregando itens do orçamento selecionado...</p>
          )}

          <TaxInput impostoPercent={impostoPercent} onChange={handleImpostoChange} />
        </section>

        <ServicePricingSummary result={pricingResult} />
      </div>
    </div>
  );
}
