import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChecklistTemplate, ChecklistTemplateItem } from '@/types/works';

export async function getChecklistTemplates(
  supabase: SupabaseClient,
  engineerId: string,
): Promise<ChecklistTemplate[]> {
  const { data, error } = await supabase
    .from('checklist_templates')
    .select(`
      id, engineer_id, name, description, is_default, is_active, created_at, updated_at,
      checklist_template_items (id, template_id, order_index, label, description, requires_photo, created_at)
    `)
    .eq('engineer_id', engineerId)
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (error || !data) return [];

  return (data as unknown as Array<{
    id: string; engineer_id: string; name: string; description: string | null;
    is_default: boolean; is_active: boolean; created_at: string; updated_at: string;
    checklist_template_items: Array<{
      id: string; template_id: string; order_index: number; label: string;
      description: string | null; requires_photo: boolean; created_at: string;
    }>;
  }>).map((t) => ({
    id: t.id,
    engineerId: t.engineer_id,
    name: t.name,
    description: t.description,
    isDefault: t.is_default,
    isActive: t.is_active,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
    items: (t.checklist_template_items ?? [])
      .sort((a, b) => a.order_index - b.order_index)
      .map((i): ChecklistTemplateItem => ({
        id: i.id,
        templateId: i.template_id,
        orderIndex: i.order_index,
        label: i.label,
        description: i.description,
        requiresPhoto: i.requires_photo,
        createdAt: i.created_at,
      })),
  }));
}
