'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient, requireAuthUserId } from '@/lib/supabaseServer';

type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string };

export type SessionNoteAuthor = 'maninho' | 'luan';

export type SessionNote = {
  id: string;
  author: SessionNoteAuthor;
  body: string;
  created_at: string;
};

const AUTHORS = new Set<SessionNoteAuthor>(['maninho', 'luan']);

function revalidateSessionPaths(sessionId: string) {
  revalidatePath(`/fornecedores/sessao/${sessionId}`);
  revalidatePath(`/fornecedores/sessao/${sessionId}/conciliacao`);
  revalidatePath(`/fornecedores/sessao/${sessionId}/cenarios`);
}

export async function listSessionNotesAction(
  sessionId: string
): Promise<ActionResult<{ notes: SessionNote[] }>> {
  try {
    if (!sessionId) {
      return { success: false, error: 'Sessão inválida.' };
    }

    const supabase = await createSupabaseServerClient();
    await requireAuthUserId(supabase);

    const { data, error } = await supabase
      .from('quotation_session_notes')
      .select('id, author, body, created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
      .limit(100);

    if (error) {
      return { success: false, error: error.message };
    }

    return {
      success: true,
      data: {
        notes: (data ?? []).map((row) => ({
          id: row.id as string,
          author: row.author as SessionNoteAuthor,
          body: row.body as string,
          created_at: row.created_at as string,
        })),
      },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao carregar recados.';
    return { success: false, error: message };
  }
}

export async function createSessionNoteAction(input: {
  sessionId: string;
  author: SessionNoteAuthor;
  body: string;
}): Promise<ActionResult<{ note: SessionNote }>> {
  try {
    const body = input.body.trim();
    if (!input.sessionId) {
      return { success: false, error: 'Sessão inválida.' };
    }
    if (!AUTHORS.has(input.author)) {
      return { success: false, error: 'Escolha Maninho ou Luan.' };
    }
    if (!body) {
      return { success: false, error: 'Escreva um recado.' };
    }
    if (body.length > 2000) {
      return { success: false, error: 'Recado muito longo (máx. 2000 caracteres).' };
    }

    const supabase = await createSupabaseServerClient();
    const userId = await requireAuthUserId(supabase);

    const { data, error } = await supabase
      .from('quotation_session_notes')
      .insert({
        session_id: input.sessionId,
        user_id: userId,
        author: input.author,
        body,
      })
      .select('id, author, body, created_at')
      .single();

    if (error || !data) {
      return { success: false, error: error?.message ?? 'Erro ao salvar recado.' };
    }

    revalidateSessionPaths(input.sessionId);

    return {
      success: true,
      data: {
        note: {
          id: data.id as string,
          author: data.author as SessionNoteAuthor,
          body: data.body as string,
          created_at: data.created_at as string,
        },
      },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao salvar recado.';
    return { success: false, error: message };
  }
}
