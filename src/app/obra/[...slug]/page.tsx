import { PublicWorkView } from '@/components/PublicWorkViewPremium';

interface ObraPageProps {
  params: Promise<{ slug: string[] }>;
}

export default async function ObraPage({ params }: ObraPageProps) {
  const { slug } = await params;

  // Replicates the normalization from the original App.tsx:
  // /obra/tracking/abc123 -> workId "tracking-abc123"
  // /obra/abc123          -> workId "abc123"
  const raw = slug.join('/');
  const workId = raw.replace(/^tracking\//, 'tracking-');

  return <PublicWorkView workId={workId} />;
}
