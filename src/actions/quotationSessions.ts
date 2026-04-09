'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient, requireAuthUserId } from '@/lib/supabaseServer';

type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string };

export type QuotationSessionRow = {
  id: string;
  title: string;
  budget_id: string | null;
  status: 'active' | 'completed';
  created_at: string;
  updated_at: string;
};

export type QuotationSessionWithStats = QuotationSessionRow & {
  quotesCount: number;
  jobsByStatus: Record<'pending' | 'processing' | 'completed' | 'error', number>;
};

export async function createQuotationSessionAction(input: {
  title: string;
  budgetId: string | null;
}): Promise<ActionResult<{ sessionId: string }>> {
  try {
    const title = input.title.trim();
    if (!title) {
      return { success: false, error: 'Informe um título para a sessão.' };
    }

    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);

    const { data, error } = await supabase
      .from('quotation_sessions')
      .insert({
        user_id: userId,
        title,
        budget_id: input.budgetId,
        status: 'active',
      })
      .select('id')
      .single();

    if (error || !data) {
      return { success: false, error: error?.message ?? 'Erro ao criar sessão.' };
    }

    revalidatePath('/fornecedores');
    return { success: true, data: { sessionId: data.id } };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao criar sessão.';
    return { success: false, error: message };
  }
}

export async function updateQuotationSessionAction(
  sessionId: string,
  input: { title: string; budgetId: string | null }
): Promise<ActionResult<void>> {
  try {
    const title = input.title.trim();
    if (!title) {
      return { success: false, error: 'Informe um título para a sessão.' };
    }

    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);

    const { data, error } = await supabase
      .from('quotation_sessions')
      .update({
        title,
        budget_id: input.budgetId,
      })
      .eq('id', sessionId)
      .eq('user_id', userId)
      .select('id')
      .single();

    if (error || !data) {
      return { success: false, error: error?.message ?? 'Erro ao atualizar sessão.' };
    }

    revalidatePath('/fornecedores');
    revalidatePath(`/fornecedores/sessao/${sessionId}`);
    return { success: true, data: undefined };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao atualizar sessão.';
    return { success: false, error: message };
  }
}

export async function deleteQuotationSessionAction(
  sessionId: string
): Promise<ActionResult<void>> {
  try {
    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);

    const { data: quotes, error: quotesError } = await supabase
      .from('supplier_quotes')
      .select('id')
      .eq('session_id', sessionId)
      .eq('user_id', userId);

    if (quotesError) {
      return { success: false, error: quotesError.message };
    }

    const quoteIds = (quotes ?? []).map((q) => q.id);

    if (quoteIds.length > 0) {
      const { error: itemsError } = await supabase
        .from('supplier_quote_items')
        .delete()
        .in('quote_id', quoteIds);

      if (itemsError) {
        return { success: false, error: itemsError.message };
      }

      const { error: quotesDeleteError } = await supabase
        .from('supplier_quotes')
        .delete()
        .in('id', quoteIds)
        .eq('user_id', userId);

      if (quotesDeleteError) {
        return { success: false, error: quotesDeleteError.message };
      }
    }

    const { data: deletedSession, error: sessionError } = await supabase
      .from('quotation_sessions')
      .delete()
      .eq('id', sessionId)
      .eq('user_id', userId)
      .select('id')
      .single();

    if (sessionError || !deletedSession) {
      return { success: false, error: sessionError?.message ?? 'Sessão não encontrada.' };
    }

    revalidatePath('/fornecedores');
    revalidatePath(`/fornecedores/sessao/${sessionId}`);
    return { success: true, data: undefined };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao excluir sessão.';
    return { success: false, error: message };
  }
}

export async function listQuotationSessionsWithStatsAction(): Promise<
  ActionResult<{ sessions: QuotationSessionWithStats[] }>
> {
  try {
    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);

    const { data: rows, error } = await supabase
      .from('quotation_sessions')
      .select('id, title, budget_id, status, created_at, updated_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      return { success: false, error: error.message };
    }

    const sessionList = rows ?? [];
    const sessionIds = sessionList.map((s) => s.id);
    if (sessionIds.length === 0) {
      return { success: true, data: { sessions: [] } };
    }

    const [quotesRes, jobsRes] = await Promise.all([
      supabase
        .from('supplier_quotes')
        .select('id, session_id')
        .eq('user_id', userId)
        .in('session_id', sessionIds),
      supabase
        .from('extraction_jobs')
        .select('id, session_id, status')
        .eq('user_id', userId)
        .in('session_id', sessionIds),
    ]);

    const quotesBySession = new Map<string, number>();
    for (const q of quotesRes.data ?? []) {
      if (!q.session_id) continue;
      quotesBySession.set(q.session_id, (quotesBySession.get(q.session_id) ?? 0) + 1);
    }

    const jobsBySession = new Map<
      string,
      QuotationSessionWithStats['jobsByStatus']
    >();
    for (const sid of sessionIds) {
      jobsBySession.set(sid, { pending: 0, processing: 0, completed: 0, error: 0 });
    }
    for (const j of jobsRes.data ?? []) {
      const bucket = jobsBySession.get(j.session_id);
      if (!bucket) continue;
      const st = j.status as keyof typeof bucket;
      if (st in bucket) bucket[st] += 1;
    }

    const sessions: QuotationSessionWithStats[] = sessionList.map((row) => ({
      id: row.id,
      title: row.title,
      budget_id: row.budget_id,
      status: row.status as QuotationSessionWithStats['status'],
      created_at: row.created_at,
      updated_at: row.updated_at,
      quotesCount: quotesBySession.get(row.id) ?? 0,
      jobsByStatus: jobsBySession.get(row.id) ?? {
        pending: 0,
        processing: 0,
        completed: 0,
        error: 0,
      },
    }));

    return { success: true, data: { sessions } };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao listar sessões.';
    return { success: false, error: message };
  }
}

export async function getQuotationSessionByIdAction(
  sessionId: string
): Promise<ActionResult<QuotationSessionRow>> {
  try {
    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);

    const { data, error } = await supabase
      .from('quotation_sessions')
      .select('id, title, budget_id, status, created_at, updated_at')
      .eq('id', sessionId)
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      return { success: false, error: 'Sessão não encontrada.' };
    }

    return {
      success: true,
      data: {
        ...data,
        status: data.status as QuotationSessionRow['status'],
      },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao carregar sessão.';
    return { success: false, error: message };
  }
}

export async function completeQuotationSessionAction(
  sessionId: string
): Promise<ActionResult<void>> {
  try {
    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);

    const { error } = await supabase
      .from('quotation_sessions')
      .update({ status: 'completed' })
      .eq('id', sessionId)
      .eq('user_id', userId);

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath('/fornecedores');
    revalidatePath(`/fornecedores/sessao/${sessionId}`);
    revalidatePath(`/fornecedores/sessao/${sessionId}/cenarios`);
    return { success: true, data: undefined };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao encerrar sessão.';
    return { success: false, error: message };
  }
}

export type ExtractionJobRow = {
  id: string;
  session_id: string;
  file_path: string;
  supplier_name: string | null;
  status: 'pending' | 'processing' | 'completed' | 'error';
  error_message: string | null;
  estimated_time: number | null;
  quote_id: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
};

export async function listExtractionJobsBySessionAction(
  sessionId: string
): Promise<ActionResult<{ jobs: ExtractionJobRow[] }>> {
  try {
    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);

    const { data, error } = await supabase
      .from('extraction_jobs')
      .select(
        'id, session_id, file_path, supplier_name, status, error_message, estimated_time, quote_id, started_at, finished_at, created_at, updated_at'
      )
      .eq('session_id', sessionId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      return { success: false, error: error.message };
    }

    return {
      success: true,
      data: {
        jobs: (data ?? []).map((j) => ({
          ...j,
          status: j.status as ExtractionJobRow['status'],
        })),
      },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao listar jobs.';
    return { success: false, error: message };
  }
}

export async function listQuotesBySessionAction(
  sessionId: string
): Promise<ActionResult<{ quotes: { id: string; supplier_name: string; status: string; created_at: string }[] }>> {
  try {
    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);

    const { data, error } = await supabase
      .from('supplier_quotes')
      .select('id, supplier_name, status, created_at')
      .eq('session_id', sessionId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: { quotes: data ?? [] } };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao listar cotações.';
    return { success: false, error: message };
  }
}
