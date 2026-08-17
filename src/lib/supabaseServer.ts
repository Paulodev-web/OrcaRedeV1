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

/**
 * Cliente anônimo que apresenta o token da proposta no header `x-proposal-token`.
 *
 * É o caminho de leitura de `/proposta/[token]`. Anônimo de propósito: com um
 * cliente autenticado, a policy do dono responderia no lugar da anônima, e o
 * dono veria a própria proposta mesmo despublicada ou revogada — a página
 * mentiria sobre o que o cliente enxerga.
 *
 * Não usa cookies e não persiste sessão. Toda a autorização fica no RLS, que
 * compara o token; sem correspondência, nenhuma linha volta.
 */
export function createSupabasePublicProposalClient(shareToken: string): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { 'x-proposal-token': shareToken } },
    }
  );
}

/**
 * Identidade do JWT, memoizada por requisição. Devolve `null` em vez de lançar.
 *
 * Usa `getClaims()`, NÃO `getUser()`.
 *
 * `getUser()` valida o token batendo no servidor de auth do Supabase — um
 * round-trip de rede a CADA chamada. Medido contra a produção deste projeto, o
 * endpoint de auth respondia entre 300ms e 3s, e isso acontecia em toda
 * navegação (uma vez no `proxy.ts` e outra aqui), antes de qualquer dado da
 * página ser buscado. Era o "clica e demora pra acontecer" que o cliente
 * relatou.
 *
 * `getClaims()` verifica a assinatura LOCALMENTE com a WebCrypto quando o
 * projeto assina o JWT com chave assimétrica — e este assina: o JWKS responde
 * uma chave ES256. O JWKS em si é buscado uma vez e fica em cache. A própria
 * lib recomenda: "Prefer this method over getUser which always sends a request
 * to the Auth server for each JWT".
 *
 * Continua sendo verificação criptográfica de verdade, não `getSession()` — o
 * token é validado (assinatura + expiração) antes de virar identidade. O que
 * some é só a ida à rede.
 *
 * Devolve apenas `{ id }` de propósito: é o que todo consumidor usa hoje, e o
 * tipo estreito impede que alguém volte a depender do registro completo do
 * Auth server sem perceber que isso custaria um round-trip. Quem realmente
 * precisar do usuário inteiro (e-mail, metadados) deve chamar
 * `supabase.auth.getUser()` explicitamente, ciente do custo.
 */
export const getCachedAuthUser = cache(
  async (supabase: SupabaseClient): Promise<{ id: string } | null> => {
    const { data, error } = await supabase.auth.getClaims();
    if (error || !data?.claims?.sub) {
      return null;
    }
    return { id: data.claims.sub };
  }
);

/**
 * JWT do cookie; lança se não houver sessão válida (alinhado a políticas RLS
 * com auth.uid() = user_id).
 *
 * Delega para `getCachedAuthUser` DE PROPÓSITO. Antes as duas funções faziam a
 * própria chamada a `auth.getUser()`, cada uma dentro do seu `cache()` — e
 * `cache()` deduplica por função, não por resultado, então elas não se
 * enxergavam. Na abertura de um orçamento isso custava duas validações de rede
 * do mesmo token, em série: o layout chama esta, e `requireModuleAccess` chama
 * a outra. Agora as duas compartilham uma única verificação.
 *
 * Desde a troca para `getClaims()`, essa verificação é local — mas manter o
 * `cache()` continua valendo: ele evita repetir a checagem de assinatura e
 * mantém uma só resposta para "quem é o usuário" dentro da mesma requisição.
 */
export const requireAuthUserId = cache(async (supabase: SupabaseClient): Promise<string> => {
  const user = await getCachedAuthUser(supabase);
  if (!user) {
    throw new Error('Usuário não autenticado.');
  }
  return user.id;
});
