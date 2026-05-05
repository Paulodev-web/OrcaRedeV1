import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { getChecklistTemplateById } from '@/services/works/getChecklistTemplateById';
import { TemplateEditor } from '@/components/andamento-obra/checklists/TemplateEditor';

interface Props {
  params: Promise<{ templateId: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { templateId } = await params;
  if (templateId === 'novo') return { title: 'Novo modelo de checklist' };
  return { title: 'Editar modelo de checklist' };
}

export default async function TemplateEditorPage({ params }: Props) {
  const { templateId } = await params;
  const isNew = templateId === 'novo';

  let template = null;
  if (!isNew) {
    const supabase = await createSupabaseServerClient();
    template = await getChecklistTemplateById(supabase, templateId);
    if (!template) notFound();
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-8 lg:px-8">
      <TemplateEditor template={template} />
    </div>
  );
}
