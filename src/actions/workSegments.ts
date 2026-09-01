'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient, requireAuthUserId } from '@/lib/supabaseServer';

/**
 * CRUD do catálogo de segmentos de obra (`work_segments`, §7.3).
 *
 * Mesmo formato de `src/actions/materialSubgroups.ts`. O que muda é o
 * `order_index`: aqui ele é a ordem de exibição no orçamento e nas tabelas de
 * "Valores Globais por Segmento" da proposta, então precisa ser mantido.
 */

type ActionResult = { success: boolean; error?: string };

/** Catálogo semeado pela migração 20260803121000, para quem quiser recriá-lo. */
const CATALOGO_PADRAO = [
  'Rede de Energia',
  'Rede Primária',
  'Rede Secundária',
  'Iluminação Pública',
  'Ramais de Ligação',
  'Telecomunicações',
  'Obras Civis',
];

const SEGMENTOS_PATHS = ['/configuracoes/segmentos', '/orcamentos'];

function revalidateSegments() {
  for (const path of SEGMENTOS_PATHS) {
    revalidatePath(path, 'layout');
  }
}

function duplicateNameError(name: string): string {
  return `Já existe um segmento com o nome "${name}".`;
}

/** Último `order_index` do usuário, para o novo segmento entrar no fim da lista. */
async function nextOrderIndex(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string
): Promise<number> {
  const { data } = await supabase
    .from('work_segments')
    .select('order_index')
    .eq('user_id', userId)
    .order('order_index', { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data?.order_index ?? 0) + 1;
}

export async function addWorkSegmentAction(name: string): Promise<ActionResult> {
  const trimmed = name.trim();
  if (!trimmed) {
    return { success: false, error: 'Informe o nome do segmento.' };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);

    const { error } = await supabase.from('work_segments').insert({
      name: trimmed,
      user_id: userId,
      order_index: await nextOrderIndex(supabase, userId),
      is_default: false,
    });

    if (error) {
      if (error.code === '23505') return { success: false, error: duplicateNameError(trimmed) };
      return { success: false, error: error.message };
    }

    revalidateSegments();
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro inesperado ao adicionar segmento.';
    return { success: false, error: message };
  }
}

export async function updateWorkSegmentAction(id: string, name: string): Promise<ActionResult> {
  const trimmed = name.trim();
  if (!trimmed) {
    return { success: false, error: 'Informe o nome do segmento.' };
  }

  try {
    const supabase = await createSupabaseServerClient();
    await requireAuthUserId(supabase);

    // O `.select()` transforma em erro o UPDATE que o RLS barrou — sem ele o
    // Supabase devolve sucesso com zero linhas e a tela "salva" o que o banco
    // recusou (mesmo cuidado de `services/segments/workSegments.ts`).
    const { data, error } = await supabase
      .from('work_segments')
      .update({ name: trimmed })
      .eq('id', id)
      .select('id');

    if (error) {
      if (error.code === '23505') return { success: false, error: duplicateNameError(trimmed) };
      return { success: false, error: error.message };
    }
    if (!data || data.length === 0) {
      return { success: false, error: 'Segmento não encontrado ou fora do seu acesso.' };
    }

    revalidateSegments();
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro inesperado ao atualizar segmento.';
    return { success: false, error: message };
  }
}

/**
 * Excluir um segmento não bloqueia nada: `ON DELETE SET NULL` dessegmenta os
 * postes e grupos que o usavam, e eles voltam a "não segmentado".
 */
export async function deleteWorkSegmentAction(id: string): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient();
    await requireAuthUserId(supabase);

    const { error } = await supabase.from('work_segments').delete().eq('id', id);
    if (error) return { success: false, error: error.message };

    revalidateSegments();
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro inesperado ao excluir segmento.';
    return { success: false, error: message };
  }
}

/**
 * Reordena o catálogo inteiro. A tela manda a lista já na ordem desejada e
 * aqui os `order_index` são reescritos de 1 a N — mais simples e mais robusto
 * que trocar dois índices, que empata quando a ordem legada tem duplicados.
 */
export async function reorderWorkSegmentsAction(orderedIds: string[]): Promise<ActionResult> {
  if (orderedIds.length === 0) return { success: true };

  try {
    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);

    const results = await Promise.all(
      orderedIds.map((id, index) =>
        supabase
          .from('work_segments')
          .update({ order_index: index + 1 })
          .eq('id', id)
          .eq('user_id', userId)
      )
    );

    const failure = results.find((result) => result.error);
    if (failure?.error) return { success: false, error: failure.error.message };

    revalidateSegments();
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro inesperado ao reordenar segmentos.';
    return { success: false, error: message };
  }
}

/**
 * Recria o catálogo padrão. Usa `ON CONFLICT DO NOTHING` via `upsert` com
 * `ignoreDuplicates`, então quem já tem os nomes não ganha duplicata nem perde
 * a ordem que definiu.
 */
export async function seedDefaultWorkSegmentsAction(): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);

    const base = await nextOrderIndex(supabase, userId);
    const { error } = await supabase.from('work_segments').upsert(
      CATALOGO_PADRAO.map((name, index) => ({
        user_id: userId,
        name,
        order_index: base + index,
        is_default: true,
      })),
      { onConflict: 'user_id,name', ignoreDuplicates: true }
    );

    if (error) return { success: false, error: error.message };

    revalidateSegments();
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro inesperado ao restaurar o catálogo.';
    return { success: false, error: message };
  }
}
