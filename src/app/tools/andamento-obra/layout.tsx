import type { ReactNode } from 'react';
import { ModuleSubNav } from '@/components/andamento-obra/ModuleSubNav';
import { ModuleHeaderBell } from '@/components/andamento-obra/ModuleHeaderBell';

export default function AndamentoObraLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-end gap-2 px-6 py-2 lg:px-8">
          <ModuleHeaderBell />
        </div>
        <ModuleSubNav />
      </div>
      {children}
    </div>
  );
}
