'use client';

import { useEffect } from 'react';
import { BarChart3, GitMerge, Package, TrendingUp, Users } from 'lucide-react';
import { StepTabs, type StepTabItem } from '@/components/layout/StepTabs';
import { useSuppliesHeaderContext } from '@/components/suppliers/SuppliesHeaderContext';

type HeaderStep = 'fornecedores' | 'cotacoes' | 'conciliacao' | 'cenarios' | 'dre';

interface SuppliesHeaderProps {
  sessionId?: string;
  sessionTitle?: string;
  activeStep?: HeaderStep;
  /** Quando há sessão mas não há orçamento vinculado, o passo Cenários fica desabilitado. */
  hasBudget?: boolean;
  title?: string;
  description?: string;
}

/**
 * Não renderiza cabeçalho próprio — registra título e abas no `ModuleHeader`
 * único da chrome de `/fornecedores` (ver `FornecedoresChrome`). Mantém a
 * mesma API de antes para não exigir mudanças nas páginas que a usam.
 */
export default function SuppliesHeader({
  sessionId,
  sessionTitle,
  activeStep,
  hasBudget,
  title = 'Suprimentos e Cotações',
  description = 'Cadastre fornecedores, importe cotações, concilie materiais e compare cenários.',
}: SuppliesHeaderProps) {
  const { setState } = useSuppliesHeaderContext();

  useEffect(() => {
    const cenariosEnabled = Boolean(sessionId && hasBudget);
    const dreEnabled = Boolean(sessionId && hasBudget);
    const budgetHint =
      sessionId && !hasBudget ? 'Vincule um orçamento à sessão para comparar cenários de compra.' : undefined;
    const dreHint =
      sessionId && !hasBudget ? 'Vincule um orçamento à sessão para abrir a DRE.' : undefined;

    const steps: StepTabItem[] = [
      {
        id: 'fornecedores',
        label: 'Fornecedores',
        icon: Users,
        href: '/fornecedores/cadastro',
      },
      {
        id: 'cotacoes',
        label: 'Cotações',
        icon: Package,
        href: sessionId ? `/fornecedores/sessao/${sessionId}` : '/fornecedores',
      },
      {
        id: 'conciliacao',
        label: 'Conciliação',
        icon: GitMerge,
        href: sessionId ? `/fornecedores/sessao/${sessionId}/conciliacao` : undefined,
        disabled: !sessionId,
      },
      {
        id: 'cenarios',
        label: 'Cenários',
        icon: BarChart3,
        href: cenariosEnabled ? `/fornecedores/sessao/${sessionId}/cenarios` : undefined,
        disabled: !cenariosEnabled,
        disabledHint: budgetHint,
      },
      {
        id: 'dre',
        label: 'DRE',
        icon: TrendingUp,
        href: dreEnabled ? `/fornecedores/sessao/${sessionId}/dre` : undefined,
        disabled: !dreEnabled,
        disabledHint: dreHint,
      },
    ];

    setState({
      title,
      description,
      breadcrumbExtra: sessionTitle ? [{ label: sessionTitle }] : undefined,
      tabs: <StepTabs steps={steps} activeStepId={activeStep} />,
    });

    return () => setState({});
  }, [sessionId, sessionTitle, activeStep, hasBudget, title, description, setState]);

  return null;
}
