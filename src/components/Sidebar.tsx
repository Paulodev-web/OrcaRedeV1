"use client";
import React, { useState } from 'react';
import { 
  Home, 
  Calculator,  
  Package, 
  Users, 
  Building, 
  Pilcrow, 
  Menu, 
  X, 
  LogOut,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';

interface SidebarProps {
  className?: string;
}

interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<any>;
  view: string;
  description?: string;
}

const navigationItems: NavItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: Home,
    view: 'dashboard',
    description: 'Visão geral do sistema'
  },
  {
    id: 'orcamento',
    label: 'Área de Trabalho',
    icon: Calculator,
    view: 'orcamento',
    description: 'Criar e editar orçamentos'
  }
];

const configurationItems: NavItem[] = [
  {
    id: 'materiais',
    label: 'Materiais',
    icon: Package,
    view: 'materiais',
    description: 'Gerenciar materiais'
  },
  {
    id: 'concessionarias',
    label: 'Concessionárias',
    icon: Building,
    view: 'concessionarias',
    description: 'Gerenciar concessionárias'
  },
  {
    id: 'grupos',
    label: 'Grupos de Itens',
    icon: Users,
    view: 'grupos',
    description: 'Gerenciar grupos'
  },
  {
    id: 'tipos-postes',
    label: 'Tipos de Postes',
    icon: Pilcrow,
    view: 'tipos-postes',
    description: 'Gerenciar tipos de postes'
  }
];

export function Sidebar({ className = '' }: SidebarProps) {
  const { currentView, setCurrentView } = useApp();
  const { signOut, user } = useAuth();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const handleNavigation = (view: string) => {
    setCurrentView(view);
    // Fechar sidebar no mobile após navegação
    setIsMobileOpen(false);
  };

  const handleLogout = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Erro ao fazer logout:', error);
    }
  };

  const toggleSidebar = () => {
    setIsCollapsed(!isCollapsed);
  };

  const toggleMobileSidebar = () => {
    setIsMobileOpen(!isMobileOpen);
  };

  const NavItemComponent = ({ item, isActive }: { item: NavItem; isActive: boolean }) => {
    const Icon = item.icon;
    
    return (
      <button
        onClick={() => handleNavigation(item.view)}
        className={`
          w-full flex items-center px-3 py-2.5 text-left rounded-lg transition-all duration-200
          ${isActive 
            ? 'bg-blue-600 text-white shadow-md' 
            : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
          }
          ${isCollapsed ? 'justify-center' : 'space-x-3'}
        `}
        title={isCollapsed ? item.label : undefined}
      >
        <Icon className="h-5 w-5 flex-shrink-0" />
        {!isCollapsed && (
          <div className="flex-1 min-w-0">
            <span className="text-sm font-medium block">{item.label}</span>
            {item.description && (
              <span className="text-xs opacity-75 block truncate">{item.description}</span>
            )}
          </div>
        )}
      </button>
    );
  };

  return (
    <>
      {/* Botão mobile para abrir sidebar */}
      <button
        onClick={toggleMobileSidebar}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-md bg-white shadow-lg text-gray-600 hover:text-gray-900 border border-gray-200 transition-all duration-200"
      >
        {isMobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>
      
      {/* Overlay para mobile */}
      {isMobileOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-black bg-opacity-50 z-40"
          onClick={toggleMobileSidebar}
        />
      )}

      {/* Sidebar */}
      <div className={`
        ${className}
        ${isCollapsed ? 'w-16' : 'w-64'}
        ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0
        fixed lg:static left-0 top-0 h-screen lg:h-full bg-white shadow-xl border-r border-gray-200 z-40 
        transition-all duration-300 ease-in-out
        flex flex-col
      `}>
        {/* Header da Sidebar */}
        <div className={`
          flex items-center justify-between p-4 border-b border-gray-200
          ${isCollapsed ? 'px-2' : 'px-4'}
        `}>
          {!isCollapsed && (
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-bold text-gray-900 truncate">
                ON Engenharia
              </h1>
              <p className="text-xs text-gray-500 truncate">
                Sistema de Orçamentos
              </p>
            </div>
          )}
          
          {/* Botão de colapsar - só visível no desktop */}
          <button
            onClick={toggleSidebar}
            className="hidden lg:block p-1.5 rounded-md hover:bg-gray-100 text-gray-500"
            title={isCollapsed ? 'Expandir sidebar' : 'Colapsar sidebar'}
          >
            {isCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </button>
        </div>

        {/* Navegação Principal */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          <div className="space-y-1">
            {!isCollapsed && (
              <h3 className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Principal
              </h3>
            )}
            {navigationItems.map((item) => (
              <NavItemComponent
                key={item.id}
                item={item}
                isActive={currentView === item.view}
              />
            ))}
          </div>

          {/* Separador */}
          <div className="my-4 border-t border-gray-200" />

          <div className="space-y-1">
            {!isCollapsed && (
              <h3 className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Configurações
              </h3>
            )}
            {configurationItems.map((item) => (
              <NavItemComponent
                key={item.id}
                item={item}
                isActive={currentView === item.view}
              />
            ))}
          </div>
        </div>

        {/* Footer da Sidebar - Usuário e Logout */}
        <div className="border-t border-gray-200 p-3">
          {!isCollapsed && user && (
            <div className="mb-3 px-3">
              <p className="text-sm font-medium text-gray-900 truncate">
                {user.email}
              </p>
              <p className="text-xs text-gray-500">
                Usuário logado
              </p>
            </div>
          )}
          
          <button
            onClick={handleLogout}
            className={`
              w-full flex items-center px-3 py-2.5 text-left rounded-lg
              text-red-600 hover:bg-red-50 hover:text-red-700
              transition-colors duration-200
              ${isCollapsed ? 'justify-center' : 'space-x-3'}
            `}
            title={isCollapsed ? 'Sair' : undefined}
          >
            <LogOut className="h-5 w-5 flex-shrink-0" />
            {!isCollapsed && (
              <span className="text-sm font-medium">Sair</span>
            )}
          </button>
        </div>
      </div>
    </>
  );
}