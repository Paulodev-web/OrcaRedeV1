"use client";

import { useEffect } from 'react';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { LegacyLayout } from '@/components/LegacyLayout';
import { AdminPortal } from '@/components/AdminPortal';
import { Dashboard } from '@/components/Dashboard';
import { AreaTrabalho } from '@/components/AreaTrabalho';
import { Configuracoes } from '@/components/Configuracoes';
import { GerenciarMateriais } from '@/components/GerenciarMateriais';
import { GerenciarMaterialSubgroups } from '@/components/GerenciarMaterialSubgroups';
import { GerenciarGrupos } from '@/components/GerenciarGrupos';
import { GerenciarConcessionarias } from '@/components/GerenciarConcessionarias';
import { GerenciarTiposPostes } from '@/components/GerenciarTiposPostes';
import { GerenciarPadroesPoste } from '@/components/GerenciarPadroesPoste';
import { EditorGrupo } from '@/components/EditorGrupo';
import { EditorPadraoPoste } from '@/components/EditorPadraoPoste';
import { EngineerPortalChrome } from '@/components/EngineerPortalChrome';
import { Login } from '@/components/Login';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ON_ENGENHARIA_LOGO_SRC } from '@/lib/branding';

function AuthenticatedApp() {
  const { currentView, activeModule, setActiveModule } = useApp();

  // O módulo ativo vive em estado do AppContext, que fica no provider raiz e
  // sobrevive à navegação client-side. Limpar na saída de "/" garante que voltar
  // ao Portal vindo de outra rota caia na tela de entrada, e não no último módulo
  // aberto. Feito na saída, e não na chegada, para o Portal já renderizar certo no
  // primeiro frame. Some quando o roteamento por estado sair na Fase 3.
  useEffect(() => {
    return () => {
      setActiveModule(null);
    };
  }, [setActiveModule]);

  if (!activeModule) {
    return <AdminPortal />;
  }

  if (activeModule === 'portal-engenheiro') {
    return (
      <ErrorBoundary>
        <EngineerPortalChrome />
      </ErrorBoundary>
    );
  }

  const renderCurrentView = () => {
    switch (currentView) {
      case 'dashboard':
        return <Dashboard />;
      case 'orcamento':
        return <AreaTrabalho />;
      case 'configuracoes':
        return <Configuracoes />;
      case 'materiais':
        return <GerenciarMateriais />;
      case 'material-subgroups':
        return <GerenciarMaterialSubgroups />;
      case 'grupos':
        return <GerenciarGrupos />;
      case 'concessionarias':
        return <GerenciarConcessionarias />;
      case 'tipos-postes':
        return <GerenciarTiposPostes />;
      case 'editor-grupo':
        return <EditorGrupo />;
      case 'padroes-poste':
        return <GerenciarPadroesPoste />;
      case 'editor-padrao-poste':
        return <EditorPadraoPoste />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <LegacyLayout>
      <ErrorBoundary>
        {renderCurrentView()}
      </ErrorBoundary>
    </LegacyLayout>
  );
}

export default function AppShell() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <img
            src={ON_ENGENHARIA_LOGO_SRC}
            alt="ON Engenharia"
            className="h-14 w-auto object-contain mx-auto mb-6 opacity-90"
          />
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return <Login />;
  }

  return (
    <ErrorBoundary>
      <AuthenticatedApp />
    </ErrorBoundary>
  );
}
