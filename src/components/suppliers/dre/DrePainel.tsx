"use client";

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AlertTriangle, Lock, TrendingUp, Unlock } from 'lucide-react';
import { toast } from 'sonner';
import { closeDreAction, openDreAction, reopenDreAction } from '@/actions/dre';
import { DreCompositionList } from './DreCompositionList';
import { DreGroupsTable } from './DreGroupsTable';
import { DreHeroStats } from './DreHeroStats';
import { DreManualEntries } from './DreManualEntries';
import { DrePurchaseOrdersTable } from './DrePurchaseOrdersTable';
import type { DreContext } from '@/services/dre/loadDreContext';

interface DrePainelProps {
  budgetId: string;
  sessionId: string;
  context: DreContext | null;
}

export function DrePainel({ budgetId, sessionId, context }: DrePainelProps) {
  const router = useRouter();
  const [opening, setOpening] = useState(false);

  const handleOpen = async () => {
    setOpening(true);
    const result = await openDreAction(budgetId, sessionId);
    setOpening(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    toast.success('DRE aberta.');
    router.refresh();
  };

  if (!context) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-surface p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <TrendingUp className="mt-0.5 h-5 w-5 text-gray-400" />
          <div>
            <h2 className="text-sm font-semibold text-neutral-900">DRE de Obra</h2>
            <p className="mt-1 text-sm text-gray-500">
              Ainda não aberta. Ao abrir, o orçado é congelado a partir da precificação principal e a receita é
              resolvida a partir da proposta aceita (ou, na ausência dela, da precificação principal).
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleOpen}
          disabled={opening}
          className="mt-4 inline-flex h-10 items-center justify-center rounded-lg bg-accent-600 px-4 text-sm font-semibold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {opening ? 'Abrindo…' : 'Abrir DRE'}
        </button>
      </div>
    );
  }

  const { dre, result } = context;
  const dreClosed = dre.status === 'fechada';

  return (
    <div className="space-y-4">
      <DreStatusBar sessionId={sessionId} context={context} />

      <DreHeroStats result={result} />

      <div className="grid gap-4 lg:grid-cols-2">
        <DreCompositionList result={result} />
        <DrePurchaseOrdersSummaryNote freightGap={context.freightGap} />
      </div>

      <DreGroupsTable dreId={dre.id} sessionId={sessionId} result={result} dreClosed={dreClosed} />

      <DrePurchaseOrdersTable sessionId={sessionId} orders={context.purchaseOrders} dreClosed={dreClosed} />

      <DreManualEntries dreId={dre.id} sessionId={sessionId} actuals={context.actuals} dreClosed={dreClosed} />
    </div>
  );
}

/** Faixa fina de status + ação de fechar/reabrir — separada do hero pra não competir com os números grandes. */
function DreStatusBar({ sessionId, context }: { sessionId: string; context: DreContext }) {
  const router = useRouter();
  const { dre } = context;
  const [busy, setBusy] = useState(false);

  const handleClose = async () => {
    setBusy(true);
    const res = await closeDreAction(dre.id, sessionId);
    setBusy(false);
    if (!res.success) {
      toast.error(res.error);
      return;
    }
    toast.success('DRE fechada.');
    router.refresh();
  };

  const handleReopen = async () => {
    setBusy(true);
    const res = await reopenDreAction(dre.id, sessionId);
    setBusy(false);
    if (!res.success) {
      toast.error(res.error);
      return;
    }
    toast.success('DRE reaberta.');
    router.refresh();
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-gray-200 bg-surface px-4 py-3 shadow-sm">
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${
            dre.status === 'fechada'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-amber-200 bg-amber-50 text-amber-700'
          }`}
        >
          {dre.status === 'fechada' ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
          {dre.status === 'fechada' ? 'DRE fechada' : 'DRE em aberto'}
        </span>
        <span className="text-xs text-gray-500">
          {context.result.gruposAbertos === 0
            ? 'Todos os 6 grupos fechados'
            : `${context.result.gruposAbertos} de ${context.result.gruposTotal} grupos ainda abertos`}
        </span>
      </div>

      {dre.status === 'aberta' ? (
        <button
          type="button"
          onClick={handleClose}
          disabled={busy}
          className="inline-flex h-8 items-center justify-center rounded-lg border border-gray-200 bg-surface px-3 text-xs font-semibold text-neutral-900 transition hover:border-accent-500/50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Fechar DRE
        </button>
      ) : (
        <button
          type="button"
          onClick={handleReopen}
          disabled={busy}
          className="inline-flex h-8 items-center justify-center rounded-lg border border-gray-200 bg-surface px-3 text-xs font-semibold text-neutral-900 transition hover:border-accent-500/50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Reabrir DRE
        </button>
      )}
    </div>
  );
}

function DrePurchaseOrdersSummaryNote({ freightGap }: { freightGap: DreContext['freightGap'] }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-surface p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-neutral-900">Frete</h3>
      {freightGap.ordersTotal === 0 ? (
        <p className="mt-3 rounded-lg bg-gray-50 px-3 py-6 text-center text-xs text-gray-500">
          Nenhuma OC emitida ainda.
        </p>
      ) : freightGap.ordersWithoutFreight > 0 ? (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {freightGap.ordersWithoutFreight} de {freightGap.ordersTotal} ordens de compra têm frete FOB sem valor
            informado, ou ainda não classificadas CIF/FOB — o grupo Frete está subestimado até isso ser preenchido
            na tabela de OCs abaixo.
          </span>
        </div>
      ) : (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-xs text-emerald-800">
          {freightGap.ordersTotal === 1
            ? 'A única ordem de compra tem frete classificado.'
            : `Todas as ${freightGap.ordersTotal} ordens de compra têm frete classificado.`}
        </div>
      )}
    </div>
  );
}
