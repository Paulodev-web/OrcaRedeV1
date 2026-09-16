import Link from 'next/link';
import type { WorkWithManager } from '@/types/works';

/**
 * A linha de identidade da obra, que vai no `description` do `ModuleHeader`:
 * cliente, concessionária, local, gerente e o atalho para o orçamento.
 */
export function WorkHeaderMeta({ work }: { work: WorkWithManager }) {
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600">
      {work.clientName && (
        <span>
          <strong className="font-medium text-gray-700">Cliente:</strong> {work.clientName}
        </span>
      )}
      {work.utilityCompany && (
        <span>
          <strong className="font-medium text-gray-700">Concessionária:</strong> {work.utilityCompany}
        </span>
      )}
      {work.address && (
        <span>
          <strong className="font-medium text-gray-700">Local:</strong> {work.address}
        </span>
      )}
      <span>
        <strong className="font-medium text-gray-700">Gerente:</strong>{' '}
        {work.managerName ?? 'Não atribuído'}
      </span>
      {work.budgetId && (
        <Link
          href={`/?budgetId=${work.budgetId}`}
          className="text-link hover:underline"
          title="Abrir o orçamento original no OrçaRede"
        >
          Ver orçamento original
        </Link>
      )}
    </span>
  );
}
