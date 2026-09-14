'use client';

import { Printer } from 'lucide-react';

/**
 * Cliente pede relatório do dia. Antes isso era o diário em PDF que o gerente
 * digitava; agora é a impressão do que o campo registrou, sem redigitar nada.
 */
export function PrintDayButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 print:hidden"
    >
      <Printer className="h-3.5 w-3.5" />
      Imprimir o dia
    </button>
  );
}
