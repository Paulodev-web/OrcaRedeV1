"use client";
import React, { useState, useEffect, useTransition, useMemo } from 'react';
import { X, FileText, Sparkles } from 'lucide-react';
import { useApp } from '@/contexts/AppContext';
import { useAlertDialog } from '@/hooks/useAlertDialog';
import { AlertDialog } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Orcamento } from '@/types';
import { addBudgetAction, updateBudgetAction, createBudgetFromTemplateAction } from '@/actions/budgets';

const EMPTY_COMPANY_VALUE = '__no_company__';
const EMPTY_TEMPLATE_VALUE = '__no_template__';

interface CriarOrcamentoModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingBudget?: Orcamento | null;
}

type CreationMode = 'blank' | 'template';

export function CriarOrcamentoModal({ isOpen, onClose, editingBudget }: CriarOrcamentoModalProps) {
  const { budgets, utilityCompanies, fetchUtilityCompanies, fetchBudgets } = useApp();
  const [isPending, startTransition] = useTransition();
  const [creationMode, setCreationMode] = useState<CreationMode>('blank');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [nome, setNome] = useState('');
  const [clientName, setClientName] = useState('');
  const [city, setCity] = useState('');
  const [selectedCompanyId, setSelectedCompanyId] = useState('');

  const alertDialog = useAlertDialog();

  const isEditing = !!editingBudget;
  const templates = useMemo(() => budgets.filter((b) => b.isTemplate), [budgets]);

  useEffect(() => {
    if (isOpen) {
      fetchUtilityCompanies();
    }
  }, [isOpen, fetchUtilityCompanies]);

  useEffect(() => {
    if (isOpen && editingBudget) {
      setNome(editingBudget.nome || '');
      setClientName(editingBudget.clientName || '');
      setCity(editingBudget.city || '');
      setSelectedCompanyId(editingBudget.company_id || '');
      setCreationMode('blank');
    } else if (isOpen && !editingBudget) {
      setNome('');
      setClientName('');
      setCity('');
      setSelectedCompanyId('');
      setCreationMode('blank');
      setSelectedTemplateId('');
    }
  }, [isOpen, editingBudget]);

  const handleSelectTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId);
    const template = templates.find((t) => t.id === templateId);
    if (template) {
      setNome(`${template.nome} (Novo)`);
      setClientName(template.clientName || '');
      setCity(template.city || '');
      setSelectedCompanyId(template.company_id || '');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!nome.trim()) {
      alertDialog.showError('Campo Obrigatório', 'Por favor, preencha o nome do projeto.');
      return;
    }

    if (!selectedCompanyId) {
      alertDialog.showError('Campo Obrigatório', 'Por favor, selecione uma concessionária.');
      return;
    }

    if (!isEditing && creationMode === 'template' && !selectedTemplateId) {
      alertDialog.showError('Campo Obrigatório', 'Por favor, selecione um modelo.');
      return;
    }

    startTransition(async () => {
      let result;
      if (isEditing && editingBudget) {
        result = await updateBudgetAction(editingBudget.id, {
          project_name: nome.trim(),
          client_name: clientName.trim() || undefined,
          city: city.trim() || undefined,
          company_id: selectedCompanyId,
        });
      } else if (creationMode === 'template') {
        result = await createBudgetFromTemplateAction(selectedTemplateId, {
          project_name: nome.trim(),
          client_name: clientName.trim() || undefined,
          city: city.trim() || undefined,
          company_id: selectedCompanyId,
        });
      } else {
        result = await addBudgetAction({
          project_name: nome.trim(),
          client_name: clientName.trim() || undefined,
          city: city.trim() || undefined,
          company_id: selectedCompanyId,
        });
      }

      if (result.success) {
        alertDialog.showSuccess(
          isEditing ? 'Orçamento Atualizado' : 'Orçamento Criado',
          isEditing
            ? 'O orçamento foi atualizado com sucesso.'
            : 'O orçamento foi criado com sucesso e está pronto para uso.'
        );
        fetchBudgets();
        onClose();
      } else {
        alertDialog.showError(
          `Erro ao ${isEditing ? 'Atualizar' : 'Criar'}`,
          result.error || `Não foi possível ${isEditing ? 'atualizar' : 'criar'} o orçamento. Tente novamente.`
        );
      }
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md border border-gray-200">
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-gray-100 rounded-lg">
              <FileText className="h-5 w-5 text-gray-700" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900">
              {isEditing ? 'Editar Orçamento' : 'Criar Novo Orçamento'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {!isEditing && (
            <div className="grid grid-cols-2 gap-2 p-1 bg-gray-100 rounded-lg">
              <button
                type="button"
                onClick={() => setCreationMode('blank')}
                className={`flex items-center justify-center space-x-1.5 py-2 rounded-md text-sm font-medium transition-colors ${
                  creationMode === 'blank'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
                disabled={isPending}
              >
                <FileText className="h-3.5 w-3.5" />
                <span>Em branco</span>
              </button>
              <button
                type="button"
                onClick={() => setCreationMode('template')}
                className={`flex items-center justify-center space-x-1.5 py-2 rounded-md text-sm font-medium transition-colors ${
                  creationMode === 'template'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
                disabled={isPending}
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>A partir de um modelo</span>
              </button>
            </div>
          )}

          {!isEditing && creationMode === 'template' && (
            <div>
              <label htmlFor="templateId" className="block text-sm font-medium text-gray-700 mb-1">
                Modelo *
              </label>
              {templates.length === 0 ? (
                <p className="text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                  Nenhum modelo disponível. Marque um orçamento existente como &quot;Modelo&quot; para vê-lo aqui.
                </p>
              ) : (
                <Select
                  value={selectedTemplateId || EMPTY_TEMPLATE_VALUE}
                  onValueChange={(value) => handleSelectTemplate(value === EMPTY_TEMPLATE_VALUE ? '' : value)}
                  disabled={isPending}
                >
                  <SelectTrigger id="templateId" className="w-full">
                    <SelectValue placeholder="Selecione um modelo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={EMPTY_TEMPLATE_VALUE}>Selecione um modelo</SelectItem>
                    {templates.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <p className="mt-1 text-xs text-gray-500">
                Postes, grupos de itens e materiais do modelo serão copiados para o novo orçamento.
              </p>
            </div>
          )}

          <div>
            <label htmlFor="nome" className="block text-sm font-medium text-gray-700 mb-1">
              Nome do Projeto *
            </label>
            <input
              type="text"
              id="nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400 text-sm"
              placeholder="Digite o nome do projeto"
              required
              disabled={isPending}
            />
          </div>

          <div>
            <label htmlFor="clientName" className="block text-sm font-medium text-gray-700 mb-1">
              Nome do Cliente
            </label>
            <input
              type="text"
              id="clientName"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400 text-sm"
              placeholder="Digite o nome do cliente (opcional)"
              disabled={isPending}
            />
          </div>

          <div>
            <label htmlFor="city" className="block text-sm font-medium text-gray-700 mb-1">
              Cidade
            </label>
            <input
              type="text"
              id="city"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400 text-sm"
              placeholder="Digite a cidade (opcional)"
              disabled={isPending}
            />
          </div>

          <div>
            <label htmlFor="companyId" className="block text-sm font-medium text-gray-700 mb-1">
              Concessionária *
            </label>
            <Select
              value={selectedCompanyId || EMPTY_COMPANY_VALUE}
              onValueChange={(value) => setSelectedCompanyId(value === EMPTY_COMPANY_VALUE ? '' : value)}
              disabled={isPending}
            >
              <SelectTrigger id="companyId" className="w-full">
                <SelectValue placeholder="Selecione uma concessionária" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={EMPTY_COMPANY_VALUE}>Selecione uma concessionária</SelectItem>
                {utilityCompanies.map((company) => (
                  <SelectItem key={company.id} value={company.id}>
                    {company.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end space-x-3 pt-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={isPending}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" loading={isPending}>
              {isEditing ? 'Salvar Alterações' : 'Criar e Iniciar Orçamento'}
            </Button>
          </div>
        </form>
      </div>

      <AlertDialog {...alertDialog.dialogProps} />
    </div>
  );
}
