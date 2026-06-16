import type { Metadata } from 'next';
import Link from 'next/link';
import { PrecificacaoCalculator } from '@/components/precificacao/PrecificacaoCalculator';
import { createSupabaseServerClient, requireAuthUserId } from '@/lib/supabaseServer';
import { getSavedPricingBudgetById } from '@/services/pricing/savedPricingBudgets';

export const metadata: Metadata = {
  title: 'Editar Precificação — OrcaRede',
  description: 'Edite uma precificação salva no módulo de precificação.',
};

interface EditarPrecificacaoPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditarPrecificacaoPage({ params }: EditarPrecificacaoPageProps) {
  const { id } = await params;
  let authError: string | null = null;
  let notFound = false;

  try {
    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);
    const saved = await getSavedPricingBudgetById(supabase, userId, id);

    if (!saved) {
      notFound = true;
    } else {
      return (
        <main className="min-h-screen bg-gray-50 p-6 lg:p-8">
          <div className="mx-auto max-w-7xl">
            <PrecificacaoCalculator initialSaved={saved} />
          </div>
        </main>
      );
    }
  } catch (err: unknown) {
    authError = err instanceof Error ? err.message : 'Não foi possível carregar a precificação.';
  }

  if (notFound) {
    return (
      <main className="min-h-screen bg-gray-50 p-6 lg:p-8">
        <div className="mx-auto max-w-7xl">
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h1 className="text-xl font-semibold text-[#1D3140]">Precificação não encontrada</h1>
            <p className="mt-2 text-sm text-gray-600">
              O card pode ter sido excluído ou você não tem permissão para acessá-lo.
            </p>
            <Link
              href="/tools/precificacao"
              className="mt-4 inline-flex text-sm font-medium text-[#64ABDE] hover:brightness-95"
            >
              Voltar ao dashboard
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-semibold text-[#1D3140]">Editar Precificação</h1>
          <p className="mt-2 text-sm text-gray-600">{authError}</p>
          <Link href="/" className="mt-4 inline-flex text-sm font-medium text-[#64ABDE] hover:brightness-95">
            Ir para o portal
          </Link>
        </div>
      </div>
    </main>
  );
}
