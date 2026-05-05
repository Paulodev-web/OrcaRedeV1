import Link from 'next/link';
import { createSupabaseServerClient, requireAuthUserId } from '@/lib/supabaseServer';
import { getChecklistTemplates } from '@/services/works/getChecklistTemplates';
import { TemplatesList } from '@/components/andamento-obra/checklists/TemplatesList';

export const metadata = { title: 'Modelos de Checklist' };

export default async function ChecklistTemplatesPage() {
  const supabase = await createSupabaseServerClient();
  const userId = await requireAuthUserId(supabase);
  const templates = await getChecklistTemplates(supabase, userId);

  return (
    <div className="mx-auto max-w-4xl px-6 py-8 lg:px-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1D3140]">Modelos de Checklist</h1>
          <p className="mt-1 text-sm text-gray-500">
            Crie modelos reutilizáveis para atribuir a suas obras.
          </p>
        </div>
        <Link
          href="/tools/andamento-obra/checklists/novo"
          className="rounded-lg bg-[#64ABDE] px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[#4A8FC2]"
        >
          + Novo modelo
        </Link>
      </div>

      <TemplatesList templates={templates} />
    </div>
  );
}
