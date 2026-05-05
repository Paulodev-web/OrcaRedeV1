import Link from 'next/link';
import { FileX2, Layers3 } from 'lucide-react';

export type CanvasEmptyStateVariant = 'no-snapshot-from-zero' | 'no-snapshot-with-budget';

interface CanvasEmptyStateProps {
  variant: CanvasEmptyStateVariant;
}

/**
 * Fallback exibido na aba "Visao Geral" quando nao ha snapshot de projeto.
 *
 * Variantes (decididas no plano - observacao 1):
 *
 * 1) `no-snapshot-from-zero`:
 *    Obra criada do zero (sem `budget_id`). Caminho normal e' importar
 *    do OrcaRede. Mostra CTA para nova obra a partir de orcamento.
 *
 * 2) `no-snapshot-with-budget`:
 *    Obra com `budget_id` mas sem snapshot. Caso raro - geralmente
 *    indica falha na importacao. Sem CTA destrutivo; orienta a contatar
 *    suporte ou tentar reimportar (fora do escopo deste bloco).
 */
export function CanvasEmptyState({ variant }: CanvasEmptyStateProps) {
  if (variant === 'no-snapshot-from-zero') {
    return (
      <section className="flex min-h-[60vh] items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-white p-8">
        <div className="max-w-md text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-500">
            <Layers3 className="h-5 w-5" aria-hidden="true" />
          </div>
          <h2 className="mt-4 text-base font-semibold text-[#1D3140]">
            Esta obra não tem projeto importado
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Esta obra foi criada do zero, sem vincular a um orçamento. Para
            visualizar o canvas com PDF, postes planejados e conexões, importe
            um orçamento existente do OrçaRede.
          </p>
          <div className="mt-5 flex flex-col items-center gap-2">
            <Link
              href="/tools/andamento-obra"
              className="inline-flex items-center justify-center rounded-md bg-[#1D3140] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#16242F]"
            >
              Importar do OrçaRede
            </Link>
            <p className="text-[11px] text-gray-500">
              Você será levado para a tela inicial onde pode iniciar uma nova
              obra a partir de um orçamento.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="flex min-h-[60vh] items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-white p-8">
      <div className="max-w-md text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
          <FileX2 className="h-5 w-5" aria-hidden="true" />
        </div>
        <h2 className="mt-4 text-base font-semibold text-[#1D3140]">
          Snapshot do projeto indisponível
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          Esta obra foi vinculada a um orçamento, mas o snapshot do projeto
          (PDF, postes, conexões) não está disponível. Isso pode indicar que a
          importação não foi concluída.
        </p>
        <p className="mt-3 text-[11px] text-gray-500">
          Se isso parece um erro, contate o suporte. A reimportação automática
          será adicionada em uma fase futura.
        </p>
      </div>
    </section>
  );
}
