import type { Metadata } from 'next';
import { createSupabaseServerClient, requireAuthUserId } from '@/lib/supabaseServer';
import { requireModuleAccess } from '@/lib/auth/moduleAccess';
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

  // Fora do try/catch acima de propósito: `redirect()` lança um sinal interno
  // do Next que aquele `catch` genérico engoliria antes do redirecionamento
  // acontecer (ver comentário em `requireModuleAccess`).
  await requireModuleAccess('orca-rede');

  return <OrcamentosListClient />;
}
