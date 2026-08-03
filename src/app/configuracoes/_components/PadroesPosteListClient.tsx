"use client";

import { useRouter } from "next/navigation";
import { GerenciarPadroesPoste } from "@/components/GerenciarPadroesPoste";

/**
 * Liga a lista de padrões de poste às rotas do editor.
 *
 * "Criar a partir de" vira `/novo?base=<id>`: o padrão base é carregado no
 * servidor e entregue ao editor sem `id`, que é como o editor legado
 * reconhece o modo criação.
 */
export function PadroesPosteListClient() {
  const router = useRouter();

  return (
    <GerenciarPadroesPoste
      hideHeading
      onEditStandard={(padrao) => router.push(`/configuracoes/padroes-poste/${padrao.id}`)}
      onCreateFromStandard={(padrao) =>
        router.push(`/configuracoes/padroes-poste/novo?base=${padrao.id}`)
      }
      onNewStandard={() => router.push("/configuracoes/padroes-poste/novo")}
    />
  );
}
