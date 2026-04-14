import Link from 'next/link';
import { Building2, ChevronRight, GitMerge, LayoutGrid, Package, BarChart3 } from 'lucide-react';

type HeaderStep = 'cotacoes' | 'conciliacao' | 'cenarios';

interface SuppliesHeaderProps {
  sessionId?: string;
  sessionTitle?: string;
  activeStep?: HeaderStep;
  title?: string;
  description?: string;
}

function stepClass(active: boolean, disabled = false) {
  if (disabled) {
    return 'inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-300';
  }
  if (active) {
    return 'inline-flex items-center gap-1.5 rounded-full border border-[#64ABDE]/40 bg-[#64ABDE]/15 px-3 py-1.5 text-xs font-semibold text-[#1D3140]';
  }
  return 'inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:border-[#64ABDE]/40 hover:text-[#1D3140]';
}

export default function SuppliesHeader({
  sessionId,
  sessionTitle,
  activeStep,
  title = 'Suprimentos e Cotações',
  description = 'Navegue entre cotações, conciliação e cenários do módulo de suprimentos.',
}: SuppliesHeaderProps) {
  const cotacoesHref = sessionId ? `/fornecedores/sessao/${sessionId}` : '/fornecedores';
  const conciliacaoHref = sessionId ? `/fornecedores/sessao/${sessionId}/conciliacao` : '';
  const cenariosHref = sessionId ? `/fornecedores/sessao/${sessionId}/cenarios` : '';

  return (
    <div className="rounded-2xl border border-[#64ABDE]/30 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-gray-400">
        <Link href="/" className="inline-flex items-center gap-1 transition-colors hover:text-[#64ABDE]">
          <LayoutGrid className="h-3.5 w-3.5" />
          Portal
        </Link>
        <ChevronRight className="h-3 w-3" />
        <Link href="/fornecedores" className="transition-colors hover:text-[#64ABDE]">
          Suprimentos
        </Link>
        {sessionTitle && (
          <>
            <ChevronRight className="h-3 w-3" />
            <span className="font-medium text-gray-600">{sessionTitle}</span>
          </>
        )}
      </div>

      <div className="mt-4 flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#64ABDE]/40 bg-[#64ABDE]/15">
          <Building2 className="h-5 w-5 text-[#1D3140]" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold text-[#1D3140] sm:text-2xl">{title}</h1>
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Link href={cotacoesHref} className={stepClass(activeStep === 'cotacoes')}>
          <Package className="h-3.5 w-3.5" />
          Cotações
        </Link>
        {sessionId ? (
          <Link href={conciliacaoHref} className={stepClass(activeStep === 'conciliacao')}>
            <GitMerge className="h-3.5 w-3.5" />
            Conciliação
          </Link>
        ) : (
          <span className={stepClass(false, true)}>
            <GitMerge className="h-3.5 w-3.5" />
            Conciliação
          </span>
        )}
        {sessionId ? (
          <Link href={cenariosHref} className={stepClass(activeStep === 'cenarios')}>
            <BarChart3 className="h-3.5 w-3.5" />
            Cenários
          </Link>
        ) : (
          <span className={stepClass(false, true)}>
            <BarChart3 className="h-3.5 w-3.5" />
            Cenários
          </span>
        )}
      </div>
    </div>
  );
}
