'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient, requireAuthUserId } from '@/lib/supabaseServer';
import { DreOpenError, openDre } from '@/services/dre/openDre';
import type { DreGroup } from '@/services/dre/types';

type ActionResult<T = void> = { success: true; data: T } | { success: false; error: string };

// A rota é por sessão (`/fornecedores/sessao/[sessionId]/dre`), não por
// orçamento — `work_dre` é por budget_id, mas a navegação do módulo de
// Suprimentos inteiro é por sessão, então é isso que revalida.
function revalidateDrePath(sessionId: string) {
  revalidatePath(`/fornecedores/sessao/${sessionId}/dre`);
}

export async function openDreAction(
  budgetId: string,
  sessionId: string
): Promise<ActionResult<{ dreId: string }>> {
  try {
    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);

    const dreId = await openDre(supabase, userId, budgetId);
    revalidateDrePath(sessionId);
    return { success: true, data: { dreId } };
  } catch (err: unknown) {
    const message =
      err instanceof DreOpenError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'Erro inesperado ao abrir a DRE.';
    return { success: false, error: message };
  }
}

export interface AddDreActualInput {
  dreId: string;
  sessionId: string;
  grupo: Exclude<DreGroup, 'material'>;
  descricao: string;
  valor: number;
  competencia: string;
}

export async function addDreActualAction(input: AddDreActualInput): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);

    if (!input.descricao.trim()) {
      return { success: false, error: 'Informe uma descrição para o lançamento.' };
    }

    if (!Number.isFinite(input.valor) || input.valor < 0) {
      return { success: false, error: 'Valor inválido.' };
    }

    const { error } = await supabase.from('dre_actuals').insert({
      dre_id: input.dreId,
      user_id: userId,
      grupo: input.grupo,
      descricao: input.descricao.trim(),
      valor: input.valor,
      competencia: input.competencia,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    revalidateDrePath(input.sessionId);
    return { success: true, data: undefined };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro inesperado ao lançar custo.';
    return { success: false, error: message };
  }
}

export async function deleteDreActualAction(id: string, sessionId: string): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient();
    await requireAuthUserId(supabase);

    const { error } = await supabase.from('dre_actuals').delete().eq('id', id);
    if (error) {
      return { success: false, error: error.message };
    }

    revalidateDrePath(sessionId);
    return { success: true, data: undefined };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro inesperado ao remover lançamento.';
    return { success: false, error: message };
  }
}

export async function setDreGroupClosedAction(
  dreId: string,
  sessionId: string,
  grupo: DreGroup,
  fechado: boolean
): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);

    const { error } = await supabase
      .from('dre_group_status')
      .update({
        fechado,
        fechado_em: fechado ? new Date().toISOString() : null,
        fechado_por: fechado ? userId : null,
      })
      .eq('dre_id', dreId)
      .eq('grupo', grupo);

    if (error) {
      return { success: false, error: error.message };
    }

    revalidateDrePath(sessionId);
    return { success: true, data: undefined };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro inesperado ao atualizar o grupo.';
    return { success: false, error: message };
  }
}

export async function closeDreAction(dreId: string, sessionId: string): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient();
    await requireAuthUserId(supabase);

    const { count, error: countError } = await supabase
      .from('dre_group_status')
      .select('grupo', { count: 'exact', head: true })
      .eq('dre_id', dreId)
      .eq('fechado', false);

    if (countError) {
      return { success: false, error: countError.message };
    }

    if ((count ?? 0) > 0) {
      return {
        success: false,
        error: 'Feche todos os 6 grupos antes de fechar a DRE — é o que garante que a margem real é real.',
      };
    }

    const { error } = await supabase
      .from('work_dre')
      .update({ status: 'fechada', closed_at: new Date().toISOString() })
      .eq('id', dreId);

    if (error) {
      return { success: false, error: error.message };
    }

    revalidateDrePath(sessionId);
    return { success: true, data: undefined };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro inesperado ao fechar a DRE.';
    return { success: false, error: message };
  }
}

export async function reopenDreAction(dreId: string, sessionId: string): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient();
    await requireAuthUserId(supabase);

    const { error } = await supabase
      .from('work_dre')
      .update({ status: 'aberta', closed_at: null })
      .eq('id', dreId);

    if (error) {
      return { success: false, error: error.message };
    }

    revalidateDrePath(sessionId);
    return { success: true, data: undefined };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro inesperado ao reabrir a DRE.';
    return { success: false, error: message };
  }
}
