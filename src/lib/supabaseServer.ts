import { createServerClient } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { cache } from 'react';

/**
 * Cliente com service role: apenas em API routes / server actions.
 * Não usa cookies nem getUser — para workers longos (ex.: extração de PDF).
 * Requer SUPABASE_SERVICE_ROLE_KEY no servidor.
 */
export function createSupabaseServiceRoleClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY ou NEXT_PUBLIC_SUPABASE_URL ausente. Defina no ambiente do servidor.'
    );
  }
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/**
 * Memoizado por requisição (React.cache): Server Components/Actions/Route Handlers que
 * chamarem isso na mesma requisição reutilizam a mesma instância, o que por sua vez faz
 * requireAuthUserId/ensureEngineerProfile/getWorkById (também memoizados) deduplicarem
 * corretamente em vez de refazer round-trips ao Supabase a cada layout/page renderizado.
 */
export const createSupabaseServerClient = cache(async () => {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Seguro ignorar: ocorre ao chamar de Server Components somente-leitura
          }
        },
      },
    }
  );
});

/** JWT do cookie; lança se não houver sessão válida (alinhado a políticas RLS com auth.uid() = user_id). */
export const requireAuthUserId = cache(async (supabase: SupabaseClient): Promise<string> => {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error('Usuário não autenticado.');
  }
  return user.id;
});

/** Como requireAuthUserId, mas retorna o objeto `user` completo (não só o id) e não lança em erro. */
export const getCachedAuthUser = cache(async (supabase: SupabaseClient) => {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});
