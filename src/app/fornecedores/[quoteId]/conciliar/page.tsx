import { redirect } from 'next/navigation';

interface Props {
  params: Promise<{ quoteId: string }>;
}

export default async function FornecedoresConciliarRedirectPage({ params }: Props) {
  const { quoteId } = await params;
  redirect(
    `/fornecedores/trabalho?tab=conciliar&quoteId=${encodeURIComponent(quoteId)}`
  );
}
