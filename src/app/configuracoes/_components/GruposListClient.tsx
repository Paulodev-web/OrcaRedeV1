"use client";

import { useRouter } from "next/navigation";
import { GerenciarGrupos } from "@/components/GerenciarGrupos";

/**
 * Liga a lista de grupos de itens às rotas do editor. O componente legado
 * continua navegando pelo `AppContext` quando essas props não são passadas —
 * é o que mantém o `AppShell` funcionando.
 */
export function GruposListClient() {
  const router = useRouter();

  return (
    <GerenciarGrupos
      hideHeading
      onEditGroup={(grupo) => router.push(`/configuracoes/grupos/${grupo.id}`)}
      onNewGroup={() => router.push("/configuracoes/grupos/novo")}
    />
  );
}
