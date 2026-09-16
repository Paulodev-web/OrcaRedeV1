"use client";

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Zap } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { Dashboard } from '@/components/Dashboard';
import { useApp } from '@/contexts/AppContext';
import { useOrcaRedeChrome } from './OrcaRedeChrome';

const FOLDER_PARAM = 'folder';

const folderUrl = (folderId: string | null) =>
  folderId ? `/orcamentos?${FOLDER_PARAM}=${folderId}` : '/orcamentos';

/**
 * Etapa 0 da esteira: a lista de orçamentos, agora em `/orcamentos`.
 *
 * O `Dashboard` é o mesmo componente do OrçaRede legado — só troca o destino
 * do clique no cartão, que era `setCurrentView('orcamento')` e passa a ser a
 * rota da etapa 1.
 *
 * Aqui também mora a ponte entre a pasta aberta e a URL. O `currentFolderId`
 * continua sendo a fonte de verdade no `AppContext` (a rota legada `/` usa o
 * mesmo Dashboard e não tem URL de pasta); esta rota apenas espelha o valor em
 * `?folder=`, para que F5, botão voltar e link compartilhado caiam na pasta
 * certa em vez de na raiz.
 */
export function OrcamentosListClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { sections, sidebarFooter } = useOrcaRedeChrome();
  const { folders, loadingFolders, currentFolderId, navigateToFolder, getFolderPath } = useApp();

  const folderParam = searchParams.get(FOLDER_PARAM);

  // Qual pasta a URL já representa. Serve para o efeito abaixo reagir só a
  // mudanças de URL vindas de fora (mount, F5, botão voltar) e nunca às que
  // este componente acabou de escrever — sem isso, os dois lados da
  // sincronização podem ficar se corrigindo em loop.
  const syncedFolderRef = useRef<string | null | undefined>(undefined);

  // URL → estado.
  useEffect(() => {
    const target = folderParam || null;
    if (syncedFolderRef.current === target) return;

    // Pasta apagada, ou de outra organização: sem isto a tela fica vazia para
    // sempre, sem dizer por quê.
    if (target && !loadingFolders && !folders.some((f) => f.id === target)) {
      window.history.replaceState(null, '', folderUrl(null));
      syncedFolderRef.current = null;
      navigateToFolder(null);
      return;
    }
    // Ainda carregando: sai sem marcar, para tentar de novo quando a lista chegar.
    if (target && loadingFolders) return;

    syncedFolderRef.current = target;
    navigateToFolder(target);
  }, [folderParam, folders, loadingFolders, navigateToFolder]);

  // Estado → URL.
  //
  // `history.pushState` nativo, e não `router.push`: a rota é dinâmica (checa
  // sessão e acesso ao módulo no servidor), então cada push refazia a request
  // RSC e remontava o Dashboard — que refaz `fetchBudgets`/`fetchFolders` na
  // montagem. Resultado: a lista piscava o esqueleto a cada clique numa pasta,
  // para mostrar dados que já estavam em memória. O `pushState` é integrado ao
  // router do Next, então `useSearchParams` continua acompanhando a URL.
  const handleFolderChange = useCallback(
    (folderId: string | null) => {
      syncedFolderRef.current = folderId;
      navigateToFolder(folderId);
      window.history.pushState(null, '', folderUrl(folderId));
    },
    [navigateToFolder],
  );

  const breadcrumb = useMemo(
    () => [
      {
        label: 'Orçamentos',
        href: currentFolderId ? '/orcamentos' : undefined,
        onNavigate: () => handleFolderChange(null),
      },
      ...getFolderPath(currentFolderId).map((folder, index, path) => ({
        label: folder.name,
        // O último nível é a página atual: vira texto, não link.
        href: index === path.length - 1 ? undefined : folderUrl(folder.id),
        onNavigate: () => handleFolderChange(folder.id),
      })),
    ],
    [currentFolderId, getFolderPath, handleFolderChange],
  );

  return (
    <AppLayout
      sections={sections}
      activeItemId="orca-rede"
      sidebarFooter={sidebarFooter}
      contentClassName="px-4 py-6 sm:px-6 lg:px-8"
      header={
        <ModuleHeader
          icon={Zap}
          title="OrçaRede"
          description="Projete a rede, consolide os materiais e siga para a precificação."
          breadcrumb={breadcrumb}
        />
      }
    >
      <div className="mx-auto w-full max-w-7xl">
        <Dashboard
          onOpenBudget={(budget) => router.push(`/orcamentos/${budget.id}/projeto`)}
          onFolderChange={handleFolderChange}
        />
      </div>
    </AppLayout>
  );
}
