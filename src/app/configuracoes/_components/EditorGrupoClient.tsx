"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { EditorGrupo } from "@/components/EditorGrupo";
import { useApp } from "@/contexts/AppContext";
import type { GrupoItem } from "@/types";

export interface EditorGrupoClientProps {
  /** `null` = modo criação. Vem resolvido do servidor em `/[id]`. */
  grupo: GrupoItem | null;
}

/**
 * Editor de grupo de itens em rota própria.
 *
 * O editor busca sozinho materiais e grupos, mas não as concessionárias — na
 * navegação legada elas já vinham carregadas pela lista. Num deep link não
 * vêm, então a garantia fica aqui.
 */
export function EditorGrupoClient({ grupo }: EditorGrupoClientProps) {
  const router = useRouter();
  const { fetchUtilityCompanies } = useApp();

  useEffect(() => {
    fetchUtilityCompanies();
  }, [fetchUtilityCompanies]);

  return (
    <EditorGrupo
      grupo={grupo}
      heightClassName="min-h-[32rem] lg:h-[calc(100vh-16rem)]"
      onExit={() => {
        router.push("/configuracoes/grupos");
        router.refresh();
      }}
    />
  );
}
