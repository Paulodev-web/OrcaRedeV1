"use client";

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowRight, CheckCircle2 } from 'lucide-react';

import { PrecificacaoCalculator } from '@/components/precificacao/PrecificacaoCalculator';
import type { SavedPricingBudget } from '@/components/precificacao/types';

interface PrecificacaoStepProps {
  budgetId: string;
  initialSaved: SavedPricingBudget | null;
}

function brl(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Etapa 3 da esteira: a precificação do orçamento aberto.
 *
 * A calculadora é a mesma de `/tools/precificacao`, em modo embutido — sem o
 * select de importação, porque o orçamento já vem da rota. O dashboard
 * standalone continua existindo como visão consolidada entre orçamentos.
 */
export function PrecificacaoStep({ budgetId, initialSaved }: PrecificacaoStepProps) {
  const router = useRouter();
  const [saved, setSaved] = useState<SavedPricingBudget | null>(initialSaved);

  return (
    <div className="space-y-4">
      {saved ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-emerald-800">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>
              Precificado em {brl(saved.result.precoTotalCliente)} — materiais{' '}
              {brl(saved.result.valorMateriais)} + serviço {brl(saved.result.valorServico)}.
            </span>
          </div>
          <Link
            href={`/orcamentos/${budgetId}/proposta`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-700"
          >
            Ir para a proposta
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      ) : (
        <p className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
          Defina o valor do serviço e os custos para liberar a etapa de proposta. Os materiais
          vêm do consolidado deste orçamento.
        </p>
      )}

      <PrecificacaoCalculator
        budgetId={budgetId}
        initialSaved={saved ?? undefined}
        onSaved={(next) => {
          setSaved(next);
          router.refresh();
        }}
      />
    </div>
  );
}
