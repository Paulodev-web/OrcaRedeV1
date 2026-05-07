import { redirect } from 'next/navigation';

interface PageProps {
  params: Promise<{ workId: string }>;
}

export default async function WorkRootPage({ params }: PageProps) {
  const { workId } = await params;
  redirect(`/tools/andamento-obra/obras/${workId}/visao-geral`);
}
