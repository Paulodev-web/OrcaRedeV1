import { redirect } from 'next/navigation';

interface Props {
  searchParams: Promise<{ budgetId?: string }>;
}

export default async function FornecedoresCenariosRedirectPage({ searchParams }: Props) {
  const { budgetId } = await searchParams;
  if (budgetId) {
    redirect(
      `/fornecedores/trabalho?tab=cenarios&budgetId=${encodeURIComponent(budgetId)}`
    );
  }
  redirect('/fornecedores/trabalho?tab=cenarios');
}
