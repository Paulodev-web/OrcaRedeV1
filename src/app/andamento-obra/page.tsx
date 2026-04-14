import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight, Clock, HardHat, LayoutGrid } from 'lucide-react';

const ON_COLORS = { navy: '#1D3140', blue: '#64ABDE' };

export const metadata: Metadata = {
  title: 'Andamento de Obra — OrcaRede',
  description: 'Acompanhamento de cronograma e evolução das obras.',
};

export default function AndamentoObraPage() {
  return (
    <main className="min-h-screen bg-slate-100 p-6 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <div className="rounded-2xl border border-[#64ABDE]/30 bg-white/95 p-5 shadow-sm backdrop-blur-sm sm:p-6">
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-gray-400">
            <Link href="/" className="inline-flex items-center gap-1 transition-colors hover:text-[#64ABDE]">
              <LayoutGrid className="h-3.5 w-3.5" />
              Portal
            </Link>
            <ChevronRight className="h-3 w-3" />
            <span className="font-medium text-gray-600">Andamento de Obra</span>
          </div>

          <div className="mt-4 flex items-start gap-3">
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#64ABDE]/40 bg-[#64ABDE]/15"
              aria-hidden
            >
              <HardHat className="h-5 w-5" style={{ color: ON_COLORS.navy }} />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-bold text-[#1D3140] sm:text-2xl">Andamento de Obra</h1>
              <p className="mt-1 text-sm text-slate-500">
                Visão consolidada do andamento físico e do cronograma das obras.
              </p>
            </div>
          </div>
        </div>

        <div
          className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center shadow-sm"
          style={{ borderColor: `${ON_COLORS.blue}33` }}
        >
          <div
            className="mb-4 flex h-14 w-14 items-center justify-center rounded-full"
            style={{ backgroundColor: `${ON_COLORS.blue}20` }}
          >
            <Clock className="h-7 w-7" style={{ color: ON_COLORS.navy }} />
          </div>
          <p className="text-lg font-semibold text-[#1D3140]">Em desenvolvimento</p>
          <p className="mt-2 max-w-md text-sm text-slate-500">
            Este módulo está em construção. Em breve você poderá acompanhar o andamento das obras por aqui.
          </p>
          <Link
            href="/"
            className="mt-8 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-95"
            style={{ background: `linear-gradient(135deg, ${ON_COLORS.navy} 0%, ${ON_COLORS.blue} 100%)` }}
          >
            Voltar ao portal
          </Link>
        </div>
      </div>
    </main>
  );
}
