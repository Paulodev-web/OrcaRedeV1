'use client';

import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { useSupplierQuoteRealtime } from '@/hooks/useSupplierQuoteRealtime';

/**
 * Componente global de notificações para o fluxo assíncrono de extração.
 * Não renderiza nada visível — apenas exibe toasts via Realtime de supplier_quotes.
 * Deve ser montado uma única vez no layout autenticado da área de fornecedores.
 */
export function SupplierQuoteNotifications() {
  const router = useRouter();

  useSupplierQuoteRealtime({
    onReady: (quote) => {
      router.refresh();
      toast.success(
        <div className="flex items-start gap-2">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
          <div>
            <p className="font-semibold text-sm">Cotação processada</p>
            <p className="text-xs text-gray-600">{quote.supplier_name} está pronta para conciliação</p>
          </div>
        </div>,
        { duration: 5000 }
      );
    },

    onError: (quote, errorMessage) => {
      toast.error(
        <div className="flex items-start gap-2">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <div>
            <p className="font-semibold text-sm">Erro na extração</p>
            <p className="text-xs text-gray-600">{quote.supplier_name}</p>
            <p className="mt-1 text-xs text-gray-500 line-clamp-2">{errorMessage}</p>
          </div>
        </div>,
        { duration: 8000 }
      );
    },
  });

  return null;
}
