"use client";

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Info } from 'lucide-react';
import { toast } from 'sonner';
import { updatePurchaseOrderAction } from '@/actions/purchaseOrders';
import { DecimalInput } from '@/components/precificacao/DecimalInput';
import type { FreightType, PurchaseOrderRow } from '@/services/dre/loadDreContext';

const currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

interface DrePurchaseOrdersTableProps {
  sessionId: string;
  orders: PurchaseOrderRow[];
  dreClosed: boolean;
}

/**
 * Ledger de ordens de compra da obra — inspirado no conteúdo da planilha de
 * referência do Paulo (Nº OC, Empresa, Frete CIF/FOB, Valor OC, Valor Frete,
 * Entrega), não no visual dela.
 *
 * Frete CIF trava o campo de valor: frete embutido no material não tem valor
 * próprio para editar (20260818140000). "Entrega" é o `status` da OC
 * (emitida ↔ entregue); cancelada não conta no realizado da DRE, mostrada
 * riscada em vez de com checkbox.
 */
export function DrePurchaseOrdersTable({ sessionId, orders, dreClosed }: DrePurchaseOrdersTableProps) {
  if (orders.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-surface p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-neutral-900">Ordens de compra</h3>
        <p className="mt-3 rounded-lg bg-gray-50 px-3 py-6 text-center text-xs text-gray-500">
          Nenhuma OC emitida para esta obra ainda.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-surface p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-neutral-900">Ordens de compra</h3>
      <p className="mt-0.5 text-xs text-gray-500">
        Cada OC soma o grupo Material da DRE. Frete CIF (embutido no material) não precisa de valor à parte.
      </p>

      <div className="mt-3 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="py-2 pr-3">Nº OC</th>
              <th className="py-2 pr-3">Fornecedor</th>
              <th className="py-2 pr-3">Frete</th>
              <th className="py-2 pr-3 text-right">Valor OC</th>
              <th className="py-2 pr-3 text-right">Valor frete</th>
              <th className="py-2 pr-3">Entrega</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <PurchaseOrderRowView
                key={order.id}
                order={order}
                sessionId={sessionId}
                disabled={dreClosed}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PurchaseOrderRowView({
  order,
  sessionId,
  disabled,
}: {
  order: PurchaseOrderRow;
  sessionId: string;
  disabled: boolean;
}) {
  const router = useRouter();
  const [freightValue, setFreightValue] = useState(order.freightValue ?? 0);
  const [busy, setBusy] = useState(false);
  const cancelada = order.status === 'cancelada';

  const applyPatch = async (patch: Parameters<typeof updatePurchaseOrderAction>[0]) => {
    setBusy(true);
    const res = await updatePurchaseOrderAction(patch);
    setBusy(false);
    if (!res.success) {
      toast.error(res.error);
      return;
    }
    router.refresh();
  };

  const setFreightType = (freightType: FreightType) => {
    applyPatch({
      id: order.id,
      sessionId,
      freightType,
      // CIF não carrega valor de frete próprio — zera para não deixar um número órfão.
      freightValue: freightType === 'cif' ? 0 : order.freightValue,
    });
  };

  const toggleEntrega = () => {
    applyPatch({
      id: order.id,
      sessionId,
      status: order.status === 'entregue' ? 'emitida' : 'entregue',
    });
  };

  return (
    <tr className={`border-b border-gray-100 ${cancelada ? 'opacity-50' : ''}`}>
      <td className="py-2 pr-3 font-medium text-neutral-900">
        <span className={cancelada ? 'line-through' : ''}>{order.ocNumber}</span>
        {order.notes && (
          <span title={order.notes} className="ml-1 inline-flex align-middle text-amber-600">
            <Info className="h-3.5 w-3.5" />
          </span>
        )}
      </td>
      <td className="py-2 pr-3 text-gray-700">{order.supplierName}</td>
      <td className="py-2 pr-3">
        <div className="inline-flex overflow-hidden rounded-full border border-gray-200 text-[11px] font-medium">
          <button
            type="button"
            disabled={disabled || busy || cancelada}
            onClick={() => setFreightType('cif')}
            className={`px-2 py-1 transition disabled:cursor-not-allowed ${
              order.freightType === 'cif'
                ? 'bg-accent-600 text-white'
                : 'bg-surface text-gray-500 hover:text-neutral-900'
            }`}
          >
            CIF
          </button>
          <button
            type="button"
            disabled={disabled || busy || cancelada}
            onClick={() => setFreightType('fob')}
            className={`px-2 py-1 transition disabled:cursor-not-allowed ${
              order.freightType === 'fob'
                ? 'bg-accent-600 text-white'
                : 'bg-surface text-gray-500 hover:text-neutral-900'
            }`}
          >
            FOB
          </button>
        </div>
      </td>
      <td className="py-2 pr-3 text-right text-gray-700">{currencyFormatter.format(order.itemsValue)}</td>
      <td className="py-2 pr-3 text-right">
        {order.freightType === 'cif' ? (
          <span className="text-xs text-gray-400">embutido</span>
        ) : (
          <DecimalInput
            value={freightValue}
            disabled={disabled || busy || cancelada}
            onValueChange={setFreightValue}
            onBlur={() => applyPatch({ id: order.id, sessionId, freightValue })}
            className="h-8 w-24 rounded-lg border border-gray-200 px-2 text-right text-xs text-gray-800 outline-none focus:border-accent-500/80 focus:ring-2 focus:ring-accent-500/20 disabled:bg-gray-50"
          />
        )}
      </td>
      <td className="py-2 pr-3">
        {cancelada ? (
          <span className="text-xs text-gray-400">Cancelada</span>
        ) : (
          <label className="inline-flex items-center gap-1.5 text-xs text-gray-600">
            <input
              type="checkbox"
              checked={order.status === 'entregue'}
              disabled={disabled || busy}
              onChange={toggleEntrega}
              className="h-3.5 w-3.5 rounded border-gray-300 text-accent-600 focus:ring-accent-500/40"
            />
            {order.status === 'entregue' ? 'Entregue' : 'Emitida'}
          </label>
        )}
      </td>
    </tr>
  );
}
