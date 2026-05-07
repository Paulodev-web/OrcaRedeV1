"use client";

import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { BudgetFolder, Orcamento } from '@/types';

interface BudgetImportSelectProps {
  budgets: Orcamento[];
  folders: BudgetFolder[];
  selectedBudgetId: string;
  loading: boolean;
  onBudgetChange: (budgetId: string) => void;
}

const NONE_VALUE = '__none__';

export function BudgetImportSelect({
  budgets,
  folders,
  selectedBudgetId,
  loading,
  onBudgetChange,
}: BudgetImportSelectProps) {
  const budgetValue = selectedBudgetId || NONE_VALUE;
  const rootBudgets = budgets.filter((budget) => !budget.folderId);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-[#1D3140]">Importação de Orçamento</h2>
      <p className="mt-1 text-xs text-gray-500">
        Selecione uma obra para carregar automaticamente os materiais e serviços estimados.
      </p>

      <div className="mt-3">
        <Select
          value={budgetValue}
          onValueChange={(value) => onBudgetChange(value === NONE_VALUE ? '' : value)}
          disabled={loading}
        >
          <SelectTrigger>
            <SelectValue placeholder={loading ? 'Carregando orçamentos...' : 'Selecione um orçamento'} />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value={NONE_VALUE}>Nenhum orçamento selecionado</SelectItem>
            </SelectGroup>

            {rootBudgets.length > 0 && (
              <SelectGroup>
                <SelectLabel>Sem pasta</SelectLabel>
                {rootBudgets.map((budget) => (
                  <SelectItem key={budget.id} value={budget.id}>
                    {budget.nome}
                  </SelectItem>
                ))}
              </SelectGroup>
            )}

            {folders.map((folder) => {
              const folderBudgets = budgets.filter((budget) => budget.folderId === folder.id);
              if (!folderBudgets.length) {
                return null;
              }

              return (
                <SelectGroup key={folder.id}>
                  <SelectLabel>{folder.name}</SelectLabel>
                  {folderBudgets.map((budget) => (
                    <SelectItem key={budget.id} value={budget.id}>
                      {budget.nome}
                    </SelectItem>
                  ))}
                </SelectGroup>
              );
            })}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
