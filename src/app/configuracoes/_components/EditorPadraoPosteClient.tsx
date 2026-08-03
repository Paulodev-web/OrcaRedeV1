"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { EditorPadraoPoste } from "@/components/EditorPadraoPoste";
import { useApp } from "@/contexts/AppContext";
import type { PoleStandard } from "@/types";

export interface EditorPadraoPosteClientProps {
  /** `null` = modo criação. Vem resolvido do servidor em `/[id]`. */
  padrao: PoleStandard | null;
}

/**
 * Editor de padrão de poste em rota própria.
 *
 * Assim como o editor de grupos, ele depende de `utilityCompanies` já
 * carregadas — o que na navegação legada era efeito colateral da lista.
 */
export function EditorPadraoPosteClient({ padrao }: EditorPadraoPosteClientProps) {
  const router = useRouter();
  const { fetchUtilityCompanies } = useApp();

  useEffect(() => {
    fetchUtilityCompanies();
  }, [fetchUtilityCompanies]);

  return (
    <EditorPadraoPoste
      padrao={padrao}
      heightClassName="min-h-[32rem] lg:h-[calc(100vh-16rem)]"
      onExit={() => {
        router.push("/configuracoes/padroes-poste");
        router.refresh();
      }}
    />
  );
}
