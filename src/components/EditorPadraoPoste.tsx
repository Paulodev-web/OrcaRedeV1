"use client";
import { useState, useEffect, useMemo, useTransition } from 'react';
import {
  Search, Plus, Minus, Save, Loader2, X, Trash2, Layers, Package, Boxes
} from 'lucide-react';
import { useApp } from '@/contexts/AppContext';
import { useAlertDialog } from '@/hooks/useAlertDialog';
import { AlertDialog } from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { addPoleStandardAction, updatePoleStandardAction } from '@/actions/poleStandards';

const EMPTY_POST_TYPE_VALUE = '__no_post_type__';

type PickerTab = 'grupos' | 'materiais';

interface GrupoEntry {
  templateId: string;
  quantidade: number;
}

interface MaterialEntry {
  materialId: string;
  quantidade: number;
}

export function EditorPadraoPoste() {
  const {
    utilityCompanies,
    itemGroups,
    materiais,
    postTypes,
    loadingGroups,
    loadingMaterials,
    loadingPostTypes,
    currentPoleStandard,
    setCurrentView,
    setCurrentPoleStandard,
    fetchItemGroupsByCompanies,
    fetchMaterials,
    fetchPostTypes,
    fetchPoleStandards,
  } = useApp();

  const [isPending, startTransition] = useTransition();
  const alertDialog = useAlertDialog();

  const [pickerTab, setPickerTab] = useState<PickerTab>('grupos');
  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const [selectedConcessionarias, setSelectedConcessionarias] = useState<string[]>([]);
  const [postTypeId, setPostTypeId] = useState('');
  const [grupos, setGrupos] = useState<GrupoEntry[]>([]);
  const [materiaisPadrao, setMateriaisPadrao] = useState<MaterialEntry[]>([]);
  const [groupSearchTerm, setGroupSearchTerm] = useState('');
  const [materialSearchTerm, setMaterialSearchTerm] = useState('');

  const isEditing = !!currentPoleStandard;

  // Inicializar / resetar campos
  useEffect(() => {
    if (currentPoleStandard) {
      setNome(currentPoleStandard.nome);
      setDescricao(currentPoleStandard.descricao || '');
      setSelectedConcessionarias(currentPoleStandard.concessionariaIds);
      setPostTypeId(currentPoleStandard.postTypeId || '');
      setGrupos(currentPoleStandard.grupos.map(g => ({ templateId: g.templateId, quantidade: g.quantidade })));
      setMateriaisPadrao(currentPoleStandard.materiais.map(m => ({ materialId: m.materialId, quantidade: m.quantidade })));
    } else {
      setNome('');
      setDescricao('');
      setSelectedConcessionarias([]);
      setPostTypeId('');
      setGrupos([]);
      setMateriaisPadrao([]);
    }
  }, [currentPoleStandard]);

  useEffect(() => {
    fetchMaterials();
    fetchPostTypes();
  }, [fetchMaterials, fetchPostTypes]);

  // Selecionar automaticamente a primeira concessionária ao criar um padrão novo
  useEffect(() => {
    if (!currentPoleStandard && selectedConcessionarias.length === 0 && utilityCompanies.length > 0) {
      setSelectedConcessionarias([utilityCompanies[0].id]);
    }
  }, [currentPoleStandard, selectedConcessionarias, utilityCompanies]);

  const toggleConcessionaria = (companyId: string, checked: boolean) => {
    if (checked) {
      setSelectedConcessionarias(prev => prev.includes(companyId) ? prev : [...prev, companyId]);
      return;
    }
    if (selectedConcessionarias.length <= 1) {
      alertDialog.showError(
        'Não Permitido',
        'O padrão precisa estar vinculado a pelo menos uma concessionária.'
      );
      return;
    }
    setSelectedConcessionarias(prev => prev.filter(id => id !== companyId));
  };

  // Buscar grupos de itens de todas as concessionárias vinculadas ao padrão —
  // como o padrão é compartilhado, o catálogo de grupos precisa ser a união
  // dos catálogos de cada concessionária selecionada (senão grupos de uma
  // concessionária "somem" ao editar um padrão também usado por outra).
  useEffect(() => {
    if (selectedConcessionarias.length > 0) {
      fetchItemGroupsByCompanies(selectedConcessionarias);
    }
  }, [selectedConcessionarias, fetchItemGroupsByCompanies]);

  const filteredGroups = useMemo(() => {
    const term = groupSearchTerm.toLowerCase();
    return itemGroups.filter(g => g.nome.toLowerCase().includes(term));
  }, [itemGroups, groupSearchTerm]);

  const getCompanySigla = (companyId: string) =>
    utilityCompanies.find(c => c.id === companyId)?.sigla || '?';

  const filteredMaterials = useMemo(() => {
    const term = materialSearchTerm.toLowerCase();
    return materiais.filter(m =>
      m.descricao.toLowerCase().includes(term) || m.codigo.toLowerCase().includes(term)
    );
  }, [materiais, materialSearchTerm]);

  const handleAddGrupo = (templateId: string) => {
    setGrupos(prev => {
      const existing = prev.find(g => g.templateId === templateId);
      if (existing) {
        return prev.map(g => g.templateId === templateId ? { ...g, quantidade: g.quantidade + 1 } : g);
      }
      return [...prev, { templateId, quantidade: 1 }];
    });
  };

  const handleGrupoQuantidade = (templateId: string, quantidade: number) => {
    if (quantidade <= 0) {
      setGrupos(prev => prev.filter(g => g.templateId !== templateId));
      return;
    }
    setGrupos(prev => prev.map(g => g.templateId === templateId ? { ...g, quantidade } : g));
  };

  const handleRemoveGrupo = (templateId: string) => {
    setGrupos(prev => prev.filter(g => g.templateId !== templateId));
  };

  const handleAddMaterial = (materialId: string) => {
    setMateriaisPadrao(prev => {
      const existing = prev.find(m => m.materialId === materialId);
      if (existing) return prev;
      return [...prev, { materialId, quantidade: 1 }];
    });
  };

  const handleMaterialQuantidade = (materialId: string, quantidade: number) => {
    if (quantidade <= 0) {
      setMateriaisPadrao(prev => prev.filter(m => m.materialId !== materialId));
      return;
    }
    setMateriaisPadrao(prev => prev.map(m => m.materialId === materialId ? { ...m, quantidade } : m));
  };

  const handleRemoveMaterial = (materialId: string) => {
    setMateriaisPadrao(prev => prev.filter(m => m.materialId !== materialId));
  };

  const handleCancel = () => {
    setCurrentPoleStandard(null);
    setCurrentView('padroes-poste');
  };

  const handleSave = () => {
    if (!nome.trim()) {
      alertDialog.showError('Campo Obrigatório', 'Por favor, digite um nome para o padrão de poste.');
      return;
    }
    if (selectedConcessionarias.length === 0) {
      alertDialog.showError('Campo Obrigatório', 'Por favor, selecione ao menos uma concessionária.');
      return;
    }
    if (grupos.length === 0 && materiaisPadrao.length === 0) {
      alertDialog.showError(
        'Composição Necessária',
        'Adicione pelo menos um grupo de itens ou material avulso ao padrão.'
      );
      return;
    }

    startTransition(async () => {
      const groupsPayload = grupos.map(g => ({ template_id: g.templateId, quantity: g.quantidade }));
      const materialsPayload = materiaisPadrao.map(m => ({ material_id: m.materialId, quantity: m.quantidade }));

      const result = isEditing
        ? await updatePoleStandardAction(currentPoleStandard!.id, {
            name: nome.trim(),
            description: descricao.trim() || undefined,
            company_ids: selectedConcessionarias,
            post_type_id: postTypeId || null,
            groups: groupsPayload,
            materials: materialsPayload,
          })
        : await addPoleStandardAction({
            name: nome.trim(),
            description: descricao.trim() || undefined,
            company_ids: selectedConcessionarias,
            post_type_id: postTypeId || null,
            groups: groupsPayload,
            materials: materialsPayload,
          });

      if (!result.success) {
        alertDialog.showError('Erro ao Salvar', result.error || 'Erro ao salvar padrão de poste. Tente novamente.');
        return;
      }

      setCurrentPoleStandard(null);
      setCurrentView('padroes-poste');
      fetchPoleStandards(selectedConcessionarias[0]);

      alertDialog.showSuccess(
        isEditing ? 'Padrão Atualizado' : 'Padrão Criado',
        isEditing
          ? 'O padrão de poste foi atualizado com sucesso em todas as concessionárias vinculadas.'
          : 'O padrão de poste foi criado com sucesso. Ele já pode ser aplicado ao adicionar postes.'
      );
    });
  };

  const totalGrupoInstancias = grupos.reduce((sum, g) => sum + g.quantidade, 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-screen">
      {/* Painel Esquerdo - Seletor de itens disponíveis */}
      <div className="bg-white rounded-lg shadow p-6 flex flex-col overflow-hidden">
        <div className="flex space-x-1 bg-gray-100 rounded-lg p-1 mb-4 flex-shrink-0">
          <button
            onClick={() => setPickerTab('grupos')}
            className={`flex-1 flex items-center justify-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              pickerTab === 'grupos' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Layers className="h-4 w-4" />
            <span>Grupos de Itens</span>
          </button>
          <button
            onClick={() => setPickerTab('materiais')}
            className={`flex-1 flex items-center justify-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              pickerTab === 'materiais' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Package className="h-4 w-4" />
            <span>Materiais Avulsos</span>
          </button>
        </div>

        {pickerTab === 'grupos' ? (
          <>
            <div className="mb-3 flex-shrink-0">
              {selectedConcessionarias.length === 0 ? (
                <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                  Selecione ao menos uma concessionária no painel ao lado para ver os grupos de itens disponíveis.
                </p>
              ) : (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
                  <input
                    type="text"
                    value={groupSearchTerm}
                    onChange={(e) => setGroupSearchTerm(e.target.value)}
                    placeholder="Buscar grupo de itens..."
                    className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    disabled={isPending}
                  />
                </div>
              )}
            </div>

            <div className="space-y-2 flex-1 overflow-y-auto">
              {loadingGroups ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                </div>
              ) : (
                selectedConcessionarias.length > 0 && filteredGroups.map((grupo) => {
                  const jaAdicionado = grupos.some(g => g.templateId === grupo.id);
                  return (
                    <div
                      key={grupo.id}
                      className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm text-gray-900 flex items-center gap-1.5">
                          {grupo.nome}
                          <span className="text-[10px] font-normal text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                            {getCompanySigla(grupo.concessionariaId)}
                          </span>
                        </div>
                        {grupo.descricao && (
                          <div className="text-xs text-gray-500 truncate">{grupo.descricao}</div>
                        )}
                        <div className="text-xs text-gray-500">{grupo.materiais.length} materiais</div>
                      </div>
                      <button
                        onClick={() => handleAddGrupo(grupo.id)}
                        disabled={isPending}
                        className={`p-1.5 rounded-full transition-colors ml-2 flex-shrink-0 ${
                          jaAdicionado
                            ? 'bg-blue-100 text-blue-600 hover:bg-blue-200'
                            : 'bg-blue-600 text-white hover:bg-blue-700'
                        }`}
                        title={jaAdicionado ? 'Adicionar mais uma unidade deste grupo' : 'Adicionar grupo'}
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })
              )}
              {selectedConcessionarias.length > 0 && !loadingGroups && filteredGroups.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-gray-500 text-sm">
                    {groupSearchTerm ? 'Nenhum grupo encontrado com essa busca.' : 'Nenhum grupo de itens cadastrado para as concessionárias selecionadas.'}
                  </p>
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="mb-3 flex-shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
                <input
                  type="text"
                  value={materialSearchTerm}
                  onChange={(e) => setMaterialSearchTerm(e.target.value)}
                  placeholder="Buscar material..."
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  disabled={isPending}
                />
              </div>
            </div>

            <div className="space-y-2 flex-1 overflow-y-auto">
              {loadingMaterials ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                </div>
              ) : (
                filteredMaterials.slice(0, 200).map((material) => {
                  const jaAdicionado = materiaisPadrao.some(m => m.materialId === material.id);
                  return (
                    <div
                      key={material.id}
                      className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm text-gray-900">{material.codigo}</div>
                        <div className="text-sm text-gray-600 truncate">{material.descricao}</div>
                        <div className="text-xs text-gray-500">
                          R$ {material.precoUnit.toFixed(2)} / {material.unidade}
                        </div>
                      </div>
                      <button
                        onClick={() => handleAddMaterial(material.id)}
                        disabled={jaAdicionado || isPending}
                        className={`p-1.5 rounded-full transition-colors ml-2 flex-shrink-0 ${
                          jaAdicionado
                            ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                            : 'bg-blue-600 text-white hover:bg-blue-700'
                        }`}
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })
              )}
              {!loadingMaterials && filteredMaterials.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-gray-500 text-sm">Nenhum material encontrado com essa busca.</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Painel Direito - Composição do padrão */}
      <div className="bg-white rounded-lg shadow p-6 flex flex-col overflow-hidden">
        <h3 className="text-lg font-semibold text-gray-900 mb-1 flex items-center gap-2 flex-shrink-0">
          <Layers className="h-5 w-5 text-blue-600" />
          {isEditing ? `Editar Padrão: ${currentPoleStandard!.nome}` : 'Novo Padrão de Poste'}
        </h3>
        <p className="text-xs text-gray-500 mb-4 flex-shrink-0">
          Combine grupos de itens (kits) e materiais avulsos em uma composição que representa
          um padrão de poste completo.
        </p>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome do Padrão *</label>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Ex: Padrão P1 - Poste Início de Rede"
              disabled={isPending}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
            <textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Descreva quando este padrão deve ser usado"
              disabled={isPending}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tipo de Poste <span className="text-gray-400 font-normal">(opcional)</span>
            </label>
            <Select
              value={postTypeId || EMPTY_POST_TYPE_VALUE}
              onValueChange={(value) => setPostTypeId(value === EMPTY_POST_TYPE_VALUE ? '' : value)}
              disabled={isPending || loadingPostTypes}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Escolher ao aplicar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={EMPTY_POST_TYPE_VALUE}>Escolher ao aplicar o padrão</SelectItem>
                {postTypes.map((pt) => (
                  <SelectItem key={pt.id} value={pt.id}>
                    {pt.name}{pt.code ? ` (${pt.code})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Concessionária(s) que Usarão este Padrão *
            </label>
            <p className="text-xs text-gray-400 mb-2">
              É o mesmo padrão para todas — editar nome, descrição, grupos ou materiais atualiza de uma vez em todas as concessionárias marcadas abaixo.
            </p>
            <div className="border border-gray-300 rounded-md p-3 max-h-40 overflow-y-auto">
              {utilityCompanies.length === 0 ? (
                <p className="text-sm text-gray-500">Nenhuma concessionária disponível</p>
              ) : (
                <div className="space-y-2">
                  {utilityCompanies.map((c) => (
                    <label
                      key={c.id}
                      className="flex items-center space-x-2 cursor-pointer hover:bg-gray-50 p-2 rounded"
                    >
                      <input
                        type="checkbox"
                        checked={selectedConcessionarias.includes(c.id)}
                        onChange={(e) => toggleConcessionaria(c.id, e.target.checked)}
                        disabled={isPending}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">{c.nome}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            {selectedConcessionarias.length > 1 && (
              <p className="mt-2 text-xs text-gray-500">
                Compartilhado por {selectedConcessionarias.length} concessionárias: {selectedConcessionarias.map(getCompanySigla).join(', ')}.
              </p>
            )}
          </div>

          {/* Grupos do padrão */}
          <div className="border-t pt-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-md font-medium text-gray-900 flex items-center gap-2">
                <Layers className="h-4 w-4 text-blue-600" />
                Grupos de Itens ({grupos.length}{totalGrupoInstancias !== grupos.length ? `, ${totalGrupoInstancias} instâncias` : ''})
              </h4>
            </div>

            {grupos.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-6 border border-dashed rounded-lg">
                Adicione grupos de itens do painel ao lado para compor este padrão.
              </p>
            ) : (
              <div className="space-y-2">
                {grupos.map(({ templateId, quantidade }) => {
                  const grupo = itemGroups.find(g => g.id === templateId);
                  return (
                    <div key={templateId} className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm text-gray-900 truncate flex items-center gap-1.5">
                          {grupo?.nome || 'Grupo não encontrado'}
                          {grupo && (
                            <span className="text-[10px] font-normal text-gray-400 bg-white px-1.5 py-0.5 rounded flex-shrink-0">
                              {getCompanySigla(grupo.concessionariaId)}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500">
                          {grupo?.materiais.length ?? 0} materiais no grupo
                        </div>
                      </div>
                      <div className="flex items-center space-x-1.5 flex-shrink-0">
                        <button
                          onClick={() => handleGrupoQuantidade(templateId, quantidade - 1)}
                          disabled={isPending}
                          className="p-1 text-gray-600 hover:bg-gray-200 rounded-full transition-colors disabled:opacity-50"
                          title="Diminuir quantidade"
                        >
                          <Minus className="h-4 w-4" />
                        </button>
                        <span className="w-8 text-center text-sm font-medium text-gray-900">{quantidade}x</span>
                        <button
                          onClick={() => handleGrupoQuantidade(templateId, quantidade + 1)}
                          disabled={isPending}
                          className="p-1 text-green-600 hover:bg-green-50 rounded-full transition-colors disabled:opacity-50"
                          title="Aumentar quantidade"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleRemoveGrupo(templateId)}
                          disabled={isPending}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded-md transition-colors disabled:opacity-50 ml-1"
                          title="Remover grupo do padrão"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Materiais avulsos do padrão */}
          <div className="border-t pt-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-md font-medium text-gray-900 flex items-center gap-2">
                <Package className="h-4 w-4 text-blue-600" />
                Materiais Avulsos ({materiaisPadrao.length})
              </h4>
            </div>

            {materiaisPadrao.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-6 border border-dashed rounded-lg">
                Opcional: adicione materiais que não fazem parte de nenhum grupo, mas sempre compõem este padrão.
              </p>
            ) : (
              <div className="space-y-2">
                {materiaisPadrao.map(({ materialId, quantidade }) => {
                  const material = materiais.find(m => m.id === materialId);
                  if (!material) return null;
                  return (
                    <div key={materialId} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm text-gray-900 truncate">{material.descricao}</div>
                        <div className="text-xs text-gray-500">{material.codigo}</div>
                      </div>
                      <div className="flex items-center space-x-1.5 flex-shrink-0">
                        <button
                          onClick={() => handleMaterialQuantidade(materialId, quantidade - 1)}
                          disabled={isPending}
                          className="p-1 text-gray-600 hover:bg-gray-200 rounded-full transition-colors disabled:opacity-50"
                          title="Diminuir 1"
                        >
                          <Minus className="h-4 w-4" />
                        </button>
                        <span className="w-8 text-center text-sm font-medium text-gray-900">
                          {quantidade}
                        </span>
                        <button
                          onClick={() => handleMaterialQuantidade(materialId, quantidade + 1)}
                          disabled={isPending}
                          className="p-1 text-green-600 hover:bg-green-50 rounded-full transition-colors disabled:opacity-50"
                          title="Aumentar 1"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleRemoveMaterial(materialId)}
                          disabled={isPending}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded-md transition-colors disabled:opacity-50 ml-1"
                          title="Remover material do padrão"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 pt-4 border-t space-y-3 flex-shrink-0">
          {(grupos.length > 0 || materiaisPadrao.length > 0) && (
            <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 rounded-md px-3 py-2">
              <Boxes className="h-3.5 w-3.5 flex-shrink-0" />
              <span>
                Ao aplicar este padrão a um poste, {totalGrupoInstancias > 0 && `${totalGrupoInstancias} grupo(s) de itens`}
                {totalGrupoInstancias > 0 && materiaisPadrao.length > 0 && ' e '}
                {materiaisPadrao.length > 0 && `${materiaisPadrao.length} material(is) avulso(s)`} serão adicionados de uma só vez.
              </span>
            </div>
          )}

          <button
            onClick={handleSave}
            disabled={isPending}
            className="w-full flex items-center justify-center space-x-2 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
            <span>
              {isPending
                ? 'Salvando...'
                : (isEditing ? 'Atualizar Padrão de Poste' : 'Salvar Padrão de Poste')}
            </span>
          </button>

          <button
            onClick={handleCancel}
            disabled={isPending}
            className="w-full px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancelar
          </button>
        </div>
      </div>

      <AlertDialog {...alertDialog.dialogProps} />
    </div>
  );
}
