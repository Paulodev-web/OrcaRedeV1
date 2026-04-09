"use client";

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { calculatePricing, DEFAULT_BDI_RATES, type BdiRates } from '@/lib/pricingMath';
import { consolidateMaterialsFromBudgetDetails } from '@/services/budgetMaterialAggregation';
import { BdiControls } from './BdiControls';
import { BudgetImportSelect } from './BudgetImportSelect';
import { LaborInput } from './LaborInput';
import { PricingMaterialsTable } from './PricingMaterialsTable';
import { PricingSummary } from './PricingSummary';
import { BUDGET_CONSOLIDATED_LINE_ID, type PricingMaterialLine } from './types';

function parseNonNegativeNumber(value: string): number {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return parsed;
}

function createManualLine(): PricingMaterialLine {
  return {
    id: `${Date.now()}-${Math.round(Math.random() * 100000)}`,
    description: '',
    quantity: 1,
    unit: 'UN',
    unitPrice: 0,
    source: 'manual',
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
  const [budgetItems, setBudgetItems] = useState<PricingMaterialLine[]>([]);
  const [manualItems, setManualItems] = useState<PricingMaterialLine[]>([]);
  const [estimatedHours, setEstimatedHours] = useState(0);
  const [hourlyRate, setHourlyRate] = useState(0);
  const [bdiRates, setBdiRates] = useState<BdiRates>(DEFAULT_BDI_RATES);

  useEffect(() => {
    if (!user) {
      return;
    }

    fetchBudgets();
    fetchFolders();
  }, [fetchBudgets, fetchFolders, user]);

  useEffect(() => {
    if (!selectedBudgetId) {
      setBudgetItems([]);
      return;
    }

    fetchBudgetDetails(selectedBudgetId);
  }, [fetchBudgetDetails, selectedBudgetId]);

  useEffect(() => {
    if (!selectedBudgetId || !budgetDetails || budgetDetails.id !== selectedBudgetId) {
      return;
    }

    const consolidatedMaterials = consolidateMaterialsFromBudgetDetails(budgetDetails);
    if (consolidatedMaterials.length === 0) {
      setBudgetItems([]);
      return;
    }

    const totalMateriais = consolidatedMaterials.reduce((acc, m) => acc + m.subtotal, 0);
    setBudgetItems([
      {
        id: BUDGET_CONSOLIDATED_LINE_ID,
        description: 'Materiais e insumos do orçamento (valor consolidado)',
        quantity: 1,
        unit: 'ORÇ',
        unitPrice: totalMateriais,
        source: 'budget',
      },
    ]);
  }, [budgetDetails, selectedBudgetId]);

  const materialsSubtotal = useMemo(() => {
    return [...budgetItems, ...manualItems].reduce((acc, item) => acc + item.quantity * item.unitPrice, 0);
  }, [budgetItems, manualItems]);

  const laborSubtotal = estimatedHours * hourlyRate;
  const pricingResult = useMemo(
    () => calculatePricing(materialsSubtotal, laborSubtotal, bdiRates),
    [bdiRates, laborSubtotal, materialsSubtotal]
  );

  const selectedBudgetName = useMemo(
    () => budgets.find((budget) => budget.id === selectedBudgetId)?.nome ?? '',
    [budgets, selectedBudgetId]
  );

  const handleRateChange = (field: keyof BdiRates, value: string) => {
    const safeValue = parseNonNegativeNumber(value);
    setBdiRates((prev) => ({ ...prev, [field]: safeValue }));
  };

  const handleUpdateItem = (
    source: 'budget' | 'manual',
    id: string,
    field: keyof Omit<PricingMaterialLine, 'id' | 'source'>,
    value: string
  ) => {
    const setter = source === 'budget' ? setBudgetItems : setManualItems;

    setter((prev) =>
      prev.map((item) => {
        if (item.id !== id) {
          return item;
        }

        if (field === 'quantity' || field === 'unitPrice') {
          return { ...item, [field]: parseNonNegativeNumber(value) };
        }

        return { ...item, [field]: value };
      })
    );
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
          Calculadora de preço de venda com base em custo direto e parâmetros de BDI. Ao importar um orçamento, o custo
          de materiais entra como um único valor consolidado (não a lista completa de itens).
          {selectedBudgetName ? ` Orçamento selecionado: ${selectedBudgetName}.` : ''}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="space-y-4">
          <BudgetImportSelect
            budgets={budgets}
            folders={folders}
            selectedBudgetId={selectedBudgetId}
            loading={loadingBudgets}
            onBudgetChange={setSelectedBudgetId}
          />

          <PricingMaterialsTable
            budgetItems={budgetItems}
            manualItems={manualItems}
            onUpdateItem={handleUpdateItem}
            onAddManualItem={() => setManualItems((prev) => [...prev, createManualLine()])}
            onRemoveManualItem={(id) => setManualItems((prev) => prev.filter((item) => item.id !== id))}
          />

          {loadingBudgetDetails && selectedBudgetId && (
            <p className="text-xs text-gray-500">Carregando itens do orçamento selecionado...</p>
          )}

          <LaborInput
            estimatedHours={estimatedHours}
            hourlyRate={hourlyRate}
            onEstimatedHoursChange={(value) => setEstimatedHours(parseNonNegativeNumber(value))}
            onHourlyRateChange={(value) => setHourlyRate(parseNonNegativeNumber(value))}
          />

          <BdiControls rates={bdiRates} onRateChange={handleRateChange} />
        </section>

        <PricingSummary result={pricingResult} />
      </div>
    </div>
  );
}
