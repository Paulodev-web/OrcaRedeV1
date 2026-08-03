import { redirect } from 'next/navigation';

interface BudgetIndexPageProps {
  params: Promise<{ budgetId: string }>;
}

/** `/orcamentos/[budgetId]` abre na etapa 1 da esteira. */
export default async function BudgetIndexPage({ params }: BudgetIndexPageProps) {
  const { budgetId } = await params;
  redirect(`/orcamentos/${budgetId}/projeto`);
}
