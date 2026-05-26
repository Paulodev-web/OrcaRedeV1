import type { Metadata } from 'next';
import Link from 'next/link';
import { createSupabaseServerClient, requireAuthUserId } from '@/lib/supabaseServer';
import { listSavedPricingBudgets } from '@/services/pricing/savedPricingBudgets';
import { PricingDashboardClient } from '@/components/precificacao/PricingDashboardClient';
import type { SavedPricingBudget } from '@/components/precificacao/types';

export const metadata: Metadata = {
  title: 'Dashboard de Precificação — OrcaRede',
  description: 'Cards de orçamentos precificados salvos no módulo de precificação.',
};

export default async function PricingDashboardPage() {
  let savedPricing: SavedPricingBudget[] = [];
  let authError: string | null = null;

  try {
    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);
    savedPricing = await listSavedPricingBudgets(supabase, userId);
  } catch (err: unknown) {
    authError = err instanceof Error ? err.message : 'Não foi possível carregar as precificações.';
  }

  if (authError) {
    return (
      <main className="min-h-screen bg-gray-50 p-6 lg:p-8">
        <div className="mx-auto max-w-7xl">
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h1 className="text-xl font-semibold text-[#1D3140]">Dashboard de Precificação</h1>
            <p className="mt-2 text-sm text-gray-600">{authError}</p>
            <Link href="/" className="mt-4 inline-flex text-sm font-medium text-[#64ABDE] hover:brightness-95">
              Ir para o portal
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <PricingDashboardClient initialItems={savedPricing} />
      </div>
    </main>
  );
}
