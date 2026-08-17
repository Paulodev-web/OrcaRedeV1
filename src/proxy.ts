import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Não colocar código entre `createServerClient` e esta chamada: a
  // recomendação é do próprio Supabase, e desrespeitar isso gera usuário
  // deslogado aleatoriamente — bug caríssimo de depurar.
  //
  // `getClaims()` no lugar de `getUser()`. Este arquivo roda em TODA
  // requisição que o matcher abaixo deixa passar — inclusive nos prefetches
  // que o Next dispara ao passar o mouse por cima de um link do menu. Com
  // `getUser()`, cada uma dessas era um round-trip ao servidor de auth do
  // Supabase (300ms a 3s medidos na produção deste projeto) só para descobrir
  // quem é o usuário. Com chave assimétrica — este projeto assina em ES256 —
  // `getClaims()` valida a assinatura localmente, sem rede.
  //
  // A chamada CONTINUA sendo necessária: é ela que renova o token perto de
  // expirar e regrava o cookie na resposta. Removê-la desloga o usuário no meio
  // do uso.
  await supabase.auth.getClaims();

  return supabaseResponse;
}

export const config = {
  matcher: [
    // Além dos estáticos, ficam de fora as rotas públicas por token
    // (`/proposta/[token]`), que são anônimas por definição: elas não têm
    // sessão para renovar, e o cliente do link público é criado à parte em
    // `createSupabasePublicProposalClient`. Passar por aqui só somava trabalho
    // à requisição de quem está vendo a proposta.
    '/((?!_next/static|_next/image|favicon.ico|proposta/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
