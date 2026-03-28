"use client";
import React from 'react';
import { Grid3X3, ChevronRight } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { useApp } from '@/contexts/AppContext';
import { ON_ENGENHARIA_LOGO_SRC } from '@/lib/branding';

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { currentView, setActiveModule } = useApp();

  const getPageTitle = () => {
    switch (currentView) {
      case 'dashboard': return 'Dashboard';
      case 'orcamento': return 'Área de Trabalho do Orçamento';
      case 'configuracoes': return 'Painel de Configurações';
      case 'materiais': return 'Gerenciar Materiais';
      case 'grupos': return 'Gerenciar Grupos de Itens';
      case 'concessionarias': return 'Gerenciar Concessionárias';
      case 'tipos-postes': return 'Gerenciar Tipos de Poste';
      case 'editor-grupo': return 'Editor de Grupo de Itens';
      default: return 'ON Engenharia Elétrica';
    }
  };

  const getPageDescription = () => {
    switch (currentView) {
      case 'dashboard': return 'Visão geral dos seus orçamentos e projetos';
      case 'orcamento': return 'Crie e edite orçamentos de projetos elétricos';
      case 'configuracoes': return 'Configure as opções do sistema';
      case 'materiais': return 'Gerencie o catálogo de materiais disponíveis';
      case 'grupos': return 'Organize materiais em grupos reutilizáveis';
      case 'concessionarias': return 'Cadastre e gerencie concessionárias de energia';
      case 'tipos-postes': return 'Configure os tipos de postes disponíveis';
      case 'editor-grupo': return 'Edite os detalhes do grupo selecionado';
      default: return '';
    }
  };

  return (
    <div className="h-screen bg-gray-50 overflow-hidden">
      <div className="flex h-full">
        {/* Sidebar */}
        <Sidebar />
        
        {/* Conteúdo Principal */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header da página */}
          <header className="bg-white shadow-sm border-b border-gray-200 flex-shrink-0">
            {/* Portal breadcrumb bar */}
            <div className="px-4 sm:px-6 lg:px-8 pt-3 pb-0">
              <div className="lg:ml-16">
                <button
                  onClick={() => setActiveModule(null)}
                  className="inline-flex items-center space-x-1.5 text-xs text-gray-400 hover:text-blue-600 transition-colors group"
                >
                  <Grid3X3 className="w-3.5 h-3.5 group-hover:text-blue-600" />
                  <span>Portal</span>
                  <ChevronRight className="w-3 h-3" />
                  <span className="text-gray-600 font-medium">Sistema de Orçamentos</span>
                </button>
              </div>
            </div>
            <div className="px-4 sm:px-6 lg:px-8 py-4">
              <div className="lg:ml-16 flex items-start gap-3 sm:gap-4"> {/* Margem para compensar botão mobile apenas */}
                <img
                  src={ON_ENGENHARIA_LOGO_SRC}
                  alt="ON Engenharia"
                  className="h-10 sm:h-11 w-auto object-contain shrink-0 mt-0.5"
                />
                <div className="min-w-0 flex-1">
                  <h1 className="text-2xl font-bold text-gray-900">
                    {getPageTitle()}
                  </h1>
                  {getPageDescription() && (
                    <p className="mt-1 text-sm text-gray-500">
                      {getPageDescription()}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </header>
          
          {/* Conteúdo da página - Com scroll interno */}
          <main className="flex-1 px-4 sm:px-6 lg:px-8 py-4 overflow-y-auto">
            <div className="lg:ml-16 h-full"> {/* Margem para compensar botão mobile apenas */}
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}