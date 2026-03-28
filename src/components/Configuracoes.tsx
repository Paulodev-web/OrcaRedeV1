"use client";
import React from 'react';
import { Package, Layers, Building2, TowerControl } from 'lucide-react';
import { useApp } from '@/contexts/AppContext';

export function Configuracoes() {
  const { setCurrentView } = useApp();

  const cards = [
    {
      icon: Package,
      title: 'Gerenciar Materiais',
      description: 'Cadastrar e gerenciar catálogo de materiais',
      action: () => setCurrentView('materiais'),
      color: 'bg-blue-600'
    },
    {
      icon: Layers,
      title: 'Gerenciar Grupos de Itens',
      description: 'Criar e gerenciar kits de materiais por concessionária',
      action: () => setCurrentView('grupos'),
      color: 'bg-green-600'
    },
    {
      icon: Building2,
      title: 'Gerenciar Concessionárias',
      description: 'Cadastrar e gerenciar concessionárias do sistema',
      action: () => setCurrentView('concessionarias'),
      color: 'bg-purple-600'
    },
    {
      icon: TowerControl,
      title: 'Gerenciar Tipos de Poste',
      description: 'Cadastrar e gerenciar catálogo de tipos de postes',
      action: () => setCurrentView('tipos-postes'),
      color: 'bg-orange-600'
    }
  ];

  return (
    <div className="flex flex-col h-full space-y-6">
      <div className="flex-shrink-0">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Configurações do Sistema</h2>
        <p className="text-gray-600">Gerencie os dados mestres do sistema de orçamentos.</p>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {cards.map((card, index) => (
            <div
              key={index}
              onClick={card.action}
              className="bg-white rounded-lg shadow-sm border p-6 cursor-pointer hover:shadow-md transition-shadow h-fit"
            >
              <div className={`${card.color} w-12 h-12 rounded-lg flex items-center justify-center mb-4`}>
                <card.icon className="h-6 w-6 text-white" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">{card.title}</h3>
              <p className="text-gray-600 text-sm">{card.description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}