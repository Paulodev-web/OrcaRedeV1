'use client';

import type { ReactNode } from 'react';
import { KanbanSquare } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { ModuleHeader, type BreadcrumbItem } from '@/components/layout/ModuleHeader';
import { useAppSidebarChrome } from '@/components/layout/useAppSidebarChrome';

export interface TarefasChromeProps {
  title: ReactNode;
  description?: ReactNode;
  breadcrumb?: BreadcrumbItem[];
  actions?: ReactNode;
  tabs?: ReactNode;
  children: ReactNode;
  contentClassName?: string;
}

/**
 * Chrome do módulo Tarefas: sidebar global + cabeçalho de módulo, via
 * `useAppSidebarChrome` (o hook que substitui as reimplementações
 * independentes de `OrcaRedeChrome`/`PropostasShell`/`ConfigShell` — módulos
 * novos usam este).
 *
 * `icon` é fixo (`KanbanSquare`, importado aqui dentro) em vez de receber a
 * referência do componente como prop: as páginas que montam este chrome são
 * Server Components, e uma referência de função/componente (ao contrário de
 * um elemento já renderizado) não atravessa a fronteira Server→Client —
 * `<TarefasChrome icon={KanbanSquare} />` vindo de um Server Component quebra
 * com "Only plain objects can be passed to Client Components".
 */
export function TarefasChrome({
  title,
  description,
  breadcrumb = [],
  actions,
  tabs,
  children,
  contentClassName,
}: TarefasChromeProps) {
  const { sections, sidebarFooter } = useAppSidebarChrome();

  return (
    <AppLayout
      sections={sections}
      sidebarFooter={sidebarFooter}
      contentClassName={contentClassName}
      header={
        <ModuleHeader
          title={title}
          description={description}
          icon={KanbanSquare}
          breadcrumb={breadcrumb}
          actions={actions}
          tabs={tabs}
        />
      }
    >
      {children}
    </AppLayout>
  );
}
