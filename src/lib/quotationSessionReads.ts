import { cache } from 'react';
import { createSupabaseServerClient, requireAuthUserId } from '@/lib/supabaseServer';
import type { ExtractionJobRow, QuotationSessionRow } from '@/actions/quotationSessions';

type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string };

export async function getQuotationSessionByIdRead(
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

export async function listExtractionJobsBySessionRead(
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

/** Dedupes within the same RSC request (e.g. layout + page). */
export const getQuotationSessionByIdCached = cache(getQuotationSessionByIdRead);

/** Dedupes within the same RSC request. */
export const listExtractionJobsBySessionCached = cache(listExtractionJobsBySessionRead);
