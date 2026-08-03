import Link from 'next/link';

export interface OrcamentosErrorScreenProps {
  title: string;
  message: string;
  /** Destino do atalho de saída. Padrão: a lista de orçamentos. */
  href?: string;
  linkLabel?: string;
}

/**
 * Tela de saída das rotas do OrçaRede quando não há o que renderizar —
 * sessão expirada, orçamento inexistente ou fora do alcance do RLS.
 */
export function OrcamentosErrorScreen({
  title,
  message,
  href = '/orcamentos',
  linkLabel = 'Voltar para os orçamentos',
}: OrcamentosErrorScreenProps) {
  return (
    <main className="min-h-screen bg-brand-surface p-6 lg:p-8">
      <div className="mx-auto max-w-3xl">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-semibold text-brand-navy">{title}</h1>
          <p className="mt-2 text-sm text-slate-600">{message}</p>
          <Link
            href={href}
            className="mt-4 inline-flex text-sm font-medium text-brand-blue hover:brightness-95"
          >
            {linkLabel}
          </Link>
        </div>
      </div>
    </main>
  );
}
