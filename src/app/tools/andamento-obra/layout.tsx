import type { ReactNode } from 'react';
import { ModuleChromeHeader } from '@/components/andamento-obra/ModuleChromeHeader';
import { ModuleSubNav } from '@/components/andamento-obra/ModuleSubNav';
import { ModuleHeaderBell } from '@/components/andamento-obra/ModuleHeaderBell';

export default function AndamentoObraLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-0 z-40 border-b border-gray-200 bg-white/95 shadow-sm backdrop-blur-sm">
        <div className="mx-auto max-w-7xl px-6 py-3 lg:px-8">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <ModuleChromeHeader />
            <div className="shrink-0 pt-0.5 sm:pt-1">
              <ModuleHeaderBell />
            </div>
          </div>
        </div>
        <ModuleSubNav />
      </div>
      {children}
    </div>
  );
}
