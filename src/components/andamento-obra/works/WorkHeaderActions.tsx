'use client';

import { StatusDropdown } from './StatusDropdown';
import type { WorkStatus } from '@/types/works';

interface WorkHeaderActionsProps {
  workId: string;
  status: WorkStatus;
}

/**
 * Status no slot `actions` do `ModuleHeader`.
 *
 * Existe como componente próprio porque o layout da obra é Server Component e
 * o dropdown de status precisa de estado no cliente. Editar/Excluir obra
 * saíram daqui e foram para o menu de três pontinhos do card na lista
 * (WorkCard), seguindo o mesmo padrão do cartão de orçamento.
 */
export function WorkHeaderActions({ workId, status }: WorkHeaderActionsProps) {
  return (
    <div className="flex flex-shrink-0 items-center gap-2">
      <StatusDropdown workId={workId} current={status} />
    </div>
  );
}
