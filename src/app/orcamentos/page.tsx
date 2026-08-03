import type { Metadata } from 'next';
import { createSupabaseServerClient, requireAuthUserId } from '@/lib/supabaseServer';
import { OrcamentosListClient } from '@/components/orcamentos/OrcamentosListClient';
import { OrcamentosErrorScreen } from '@/components/orcamentos/OrcamentosErrorScreen';

export const metadata: Metadata = {
  title: 'Orçamentos — OrcaRede',
  description: 'Lista de orçamentos de projetos de redes elétricas.',
};

export default async function OrcamentosPage() {
  try {
    const supabase = await createSupabaseServerClient();
    await requireAuthUserId(supabase);
  } catch {
    return (
      <OrcamentosErrorScreen
        title="Sessão expirada"
        message="Entre novamente para acessar seus orçamentos."
        href="/"
        linkLabel="Ir para o portal"
      />
    );
  }

  return <OrcamentosListClient />;
}
