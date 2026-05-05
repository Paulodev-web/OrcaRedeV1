import Link from 'next/link';
import { ChevronRight, Grid3X3 } from 'lucide-react';
import { ON_ENGENHARIA_LOGO_SRC } from '@/lib/branding';

/**
 * Barra superior do módulo: alinhada ao breadcrumb do Layout principal (Portal → …)
 * e ao padrão do AdminPortal (logo + título).
 */
export function ModuleChromeHeader() {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1 text-xs text-gray-400">
          <Link
            href="/"
            className="inline-flex items-center gap-1 transition-colors hover:text-[#64ABDE]"
          >
            <Grid3X3 className="h-3.5 w-3.5 shrink-0" />
            Portal
          </Link>
          <ChevronRight className="h-3 w-3 shrink-0 text-gray-300" aria-hidden />
          <Link
            href="/tools/andamento-obra"
            className="font-medium text-gray-600 transition-colors hover:text-[#64ABDE]"
          >
            Andamento de obra
          </Link>
        </div>
        <div className="mt-2 flex items-center gap-2.5">
          <img
            src={ON_ENGENHARIA_LOGO_SRC}
            alt="ON Engenharia"
            className="h-8 w-auto shrink-0 object-contain sm:h-9"
          />
          <div className="min-w-0">
            <p className="text-sm font-bold leading-tight text-[#1D3140] sm:text-base">
              Andamento de Obra
            </p>
            <p className="text-xs leading-tight text-slate-500">
              Cronograma, marcos e acompanhamento em campo
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
