"use client";

import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { Layout } from '@/components/Layout';
import { AdminPortal } from '@/components/AdminPortal';
import { Dashboard } from '@/components/Dashboard';
import { AreaTrabalho } from '@/components/AreaTrabalho';
import { Configuracoes } from '@/components/Configuracoes';
import { GerenciarMateriais } from '@/components/GerenciarMateriais';
import { GerenciarGrupos } from '@/components/GerenciarGrupos';
import { GerenciarConcessionarias } from '@/components/GerenciarConcessionarias';
import { GerenciarTiposPostes } from '@/components/GerenciarTiposPostes';
import { EditorGrupo } from '@/components/EditorGrupo';
import { EngineerPortal } from '@/components/EngineerPortal';
import { Login } from '@/components/Login';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ON_ENGENHARIA_LOGO_SRC } from '@/lib/branding';

function AuthenticatedApp() {
  const { currentView, activeModule } = useApp();

  if (!activeModule) {
    return <AdminPortal />;
  }

  if (activeModule === 'portal-engenheiro') {
    return (
      <ErrorBoundary>
        <EngineerPortal />
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
      case 'grupos':
        return <GerenciarGrupos />;
      case 'concessionarias':
        return <GerenciarConcessionarias />;
      case 'tipos-postes':
        return <GerenciarTiposPostes />;
      case 'editor-grupo':
        return <EditorGrupo />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <Layout>
      <ErrorBoundary>
        {renderCurrentView()}
      </ErrorBoundary>
    </Layout>
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
