"use client";
import { createContext, useContext, useState, ReactNode, useCallback, useEffect } from 'react';
import { Material, GrupoItem, Concessionaria, Orcamento, BudgetPostDetail, BudgetDetails, PostType, BudgetFolder } from '@/types';
import { gruposItens as initialGrupos, concessionarias, orcamentos as initialOrcamentos } from '@/data/mockData';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from './AuthContext';
import { processAndUploadMaterials } from '@/services/materialImportService';

interface AppContextType {
  materiais: Material[];
  gruposItens: GrupoItem[];
  concessionarias: Concessionaria[];
  orcamentos: Orcamento[];
  budgets: Orcamento[];
  budgetDetails: BudgetDetails | null;
  postTypes: PostType[];
  currentOrcamento: Orcamento | null;
  currentView: string;
  loadingMaterials: boolean;
  loadingBudgets: boolean;
  loadingBudgetDetails: boolean;
  loadingPostTypes: boolean;
  loadingUpload: boolean;
  loading: boolean;
  
  // Novos estados para gerenciar grupos
  utilityCompanies: Concessionaria[];
  itemGroups: GrupoItem[];
  loadingCompanies: boolean;
  loadingGroups: boolean;
  currentGroup: GrupoItem | null;
  
  // Estados para sistema de pastas
  folders: BudgetFolder[];
  loadingFolders: boolean;
  currentFolderId: string | null;
  
  activeModule: string | null;
  setActiveModule: (module: string | null) => void;
  setCurrentView: (view: string) => void;
  setCurrentOrcamento: (orcamento: Orcamento | null) => void;
  setCurrentGroup: (group: GrupoItem | null) => void;
  
  // Funções de sincronização
  fetchAllCoreData: () => Promise<void>;
  
  // Funções de materiais
  fetchMaterials: (forceRefresh?: boolean) => Promise<void>;
  deleteAllMaterials: () => Promise<void>;
  importMaterialsFromCSV: (file: File) => Promise<{ success: boolean; message: string }>;
  
  // Funções de orçamentos
  fetchBudgets: () => Promise<void>;
  fetchBudgetDetails: (budgetId: string) => Promise<BudgetDetails | null>;
  uploadPlanImage: (budgetId: string, file: File) => Promise<void>;
  deletePlanImage: (budgetId: string) => Promise<void>;
  
  // Funções de tipos de poste
  fetchPostTypes: () => Promise<void>;
  addPostToBudget: (newPostData: { budget_id: string; post_type_id: string; name: string; x_coord: number; y_coord: number; skipPostTypeMaterial?: boolean; }) => Promise<string>;
  addGroupToPost: (groupId: string, postId: string) => Promise<void>;
  deletePostFromBudget: (postId: string) => Promise<void>;
  updatePostCoordinates: (postId: string, x: number, y: number) => Promise<void>;
  updatePostCustomName: (postId: string, customName: string) => Promise<void>;
  updatePostCounter: (postId: string, newCounter: number) => Promise<void>;
  removeGroupFromPost: (postGroupId: string) => Promise<void>;
  updateMaterialQuantityInPostGroup: (postGroupId: string, materialId: string, newQuantity: number) => Promise<void>;
  removeMaterialFromPostGroup: (postGroupId: string, materialId: string) => Promise<void>;
  
  // Funções para materiais avulsos
  addLooseMaterialToPost: (postId: string, materialId: string, quantity: number, price: number) => Promise<void>;
  updateLooseMaterialQuantity: (postMaterialId: string, newQuantity: number) => Promise<void>;
  removeLooseMaterialFromPost: (postMaterialId: string) => Promise<void>;
  
  // Função para atualizar preços consolidados
  updateConsolidatedMaterialPrice: (budgetId: string, materialId: string, newPrice: number) => Promise<void>;
  
  // Funções para concessionárias e grupos
  fetchUtilityCompanies: () => Promise<void>;
  fetchItemGroups: (companyId: string) => Promise<void>;
  // Funções para sistema de pastas
  fetchFolders: () => Promise<void>;
  navigateToFolder: (folderId: string | null) => void;
  getFolderPath: (folderId: string | null) => BudgetFolder[];
  isFolderDescendant: (possibleDescendantId: string, ancestorId: string) => boolean;
  
  // Funções locais (legacy)
  addGrupoItem: (grupo: Omit<GrupoItem, 'id'>) => void;
  updateGrupoItem: (id: string, grupo: Omit<GrupoItem, 'id'>) => void;
  deleteGrupoItem: (id: string) => void;
  addOrcamento: (orcamento: Omit<Orcamento, 'id'>) => void;
  updateOrcamento: (id: string, orcamento: Partial<Orcamento>) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

/**
 * ⚡ LIMITES DE PAGINAÇÃO OTIMIZADOS:
 * - Materiais: Sem limite (paginação automática por fetchAllRecords)
 * - Orçamentos: Sem limite (paginação automática por fetchAllRecords)
 * - Postes por orçamento: 500 (range otimizado)
 * - Grupos por concessionária: 200 (range otimizado)
 * - Grupos por poste: 2000 (500 postes x ~4 grupos média)
 * 
 * Esses limites foram ajustados para reduzir o volume de dados nas requisições
 * sem comprometer a funcionalidade para casos de uso reais.
 */

/**
 * Função helper para buscar TODOS os registros de uma tabela usando paginação automática
 * @param tableName - Nome da tabela
 * @param selectQuery - Query de seleção (ex: '*' ou 'id, name, ...')
 * @param orderBy - Campo para ordenar
 * @param ascending - Ordem crescente ou decrescente
 * @param filters - Filtros adicionais (opcional)
 * @returns Array com todos os registros
 */
async function fetchAllRecords(
  tableName: string,
  selectQuery: string = '*',
  orderBy: string = 'created_at',
  ascending: boolean = false,
  filters?: any
): Promise<any[]> {
  let allRecords: any[] = [];
  let page = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    
    let query = supabase
      .from(tableName)
      .select(selectQuery, { count: 'exact' })
      .order(orderBy, { ascending })
      .range(from, to);

    // Aplicar filtros adicionais se fornecidos
    if (filters) {
      Object.keys(filters).forEach(key => {
        query = query.eq(key, filters[key]);
      });
    }

    const { data, error } = await query;

    if (error) {
      console.error(`Erro ao buscar registros de "${tableName}":`, error);
      throw error;
    }

    if (data && data.length > 0) {
      allRecords = [...allRecords, ...data];
      hasMore = data.length === pageSize;
      page++;
    } else {
      hasMore = false;
    }
  }

  return allRecords;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [materiais, setMateriais] = useState<Material[]>([]);
  const [gruposItens, setGruposItens] = useState<GrupoItem[]>(initialGrupos);
  const [orcamentos, setOrcamentos] = useState<Orcamento[]>(initialOrcamentos);
  const [budgets, setBudgets] = useState<Orcamento[]>([]);
  const [budgetDetails, setBudgetDetails] = useState<BudgetDetails | null>(null);
  const [postTypes, setPostTypes] = useState<PostType[]>([]);
  const [currentOrcamento, setCurrentOrcamento] = useState<Orcamento | null>(null);
  const [currentView, setCurrentView] = useState<string>('dashboard');
  const [activeModule, setActiveModule] = useState<string | null>(null);
  const [loadingMaterials, setLoadingMaterials] = useState<boolean>(false);
  const [loadingBudgets, setLoadingBudgets] = useState<boolean>(false);
  const [loadingBudgetDetails, setLoadingBudgetDetails] = useState<boolean>(false);
  const [loadingPostTypes, setLoadingPostTypes] = useState<boolean>(false);
  const [loadingUpload, setLoadingUpload] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [isInitialized, setIsInitialized] = useState<boolean>(false);
  
  // ⚡ CACHE: Flags para evitar recarregamentos desnecessários
  const [hasFetchedMaterials, setHasFetchedMaterials] = useState<boolean>(false);
  const [hasFetchedPostTypes, setHasFetchedPostTypes] = useState<boolean>(false);
  
  // Novos estados para gerenciar grupos
  const [utilityCompanies, setUtilityCompanies] = useState<Concessionaria[]>([]);
  const [itemGroups, setItemGroups] = useState<GrupoItem[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState<boolean>(false);
  const [loadingGroups, setLoadingGroups] = useState<boolean>(false);
  const [currentGroup, setCurrentGroup] = useState<GrupoItem | null>(null);

  // Estados para sistema de pastas
  const [folders, setFolders] = useState<BudgetFolder[]>([]);
  const [loadingFolders, setLoadingFolders] = useState<boolean>(false);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null); // null = raiz

  // Efeito para inicializar o AppContext apenas após o AuthContext estar estável
  useEffect(() => {
    // Pequeno delay para garantir que o AuthContext esteja completamente inicializado
    const timer = setTimeout(() => {
      setIsInitialized(true);
    }, 100);

    return () => clearTimeout(timer);
  }, []);


  const fetchMaterials = useCallback(async (forceRefresh: boolean = false) => {
    // ⚡ CACHE: Evita recarregar se já tiver dados em cache (a menos que forçado)
    if (hasFetchedMaterials && materiais.length > 0 && !forceRefresh) {
      console.log("💾 Usando materiais do cache (", materiais.length, "itens)");
      return;
    }

    try {
      setLoadingMaterials(true);
      console.log("📦 Carregando materiais do banco de dados...");

      // Buscar TODOS os materiais usando a função helper de paginação
      const allMaterials = await fetchAllRecords('materials', '*', 'created_at', false);

      // Mapear os dados do banco para o formato do frontend
      const materiaisFormatados: Material[] = allMaterials.map(item => ({
        id: item.id,
        codigo: item.code || '',
        descricao: item.name || '',
        precoUnit: parseFloat(item.price) || 0,
        unidade: item.unit || '',
      }));

      // Remover duplicatas baseado no ID (manter apenas o primeiro)
      const materiaisUnicos: Material[] = [];
      const idsVistos = new Set<string>();
      
      for (const material of materiaisFormatados) {
        if (!idsVistos.has(material.id)) {
          idsVistos.add(material.id);
          materiaisUnicos.push(material);
        }
      }

      setMateriais(materiaisUnicos);
      setHasFetchedMaterials(true);
      console.log("✅ Materiais carregados:", materiaisUnicos.length, "itens");
    } catch (error) {
      console.error('Erro ao buscar materiais:', error);
      // Em caso de erro, mantém a lista vazia
      setMateriais([]);
    } finally {
      setLoadingMaterials(false);
    }
  }, [hasFetchedMaterials, materiais.length]);

  const deleteAllMaterials = async () => {
    try {
      // Chama a função RPC do Supabase que deleta todos os materiais
      const { error } = await supabase.rpc('delete_all_materials');

      if (error) {
        console.error('Erro ao excluir todos os materiais:', error);
        throw error;
      }

      // Limpar o estado local
      setMateriais([]);
      
      // Recarregar para garantir
      await fetchMaterials(true); // Forçar refresh
    } catch (error) {
      console.error('Erro ao excluir todos os materiais:', error);
      throw error;
    }
  };

  const importMaterialsFromCSV = async (file: File): Promise<{ success: boolean; message: string }> => {
    setLoading(true);
    
    try {
      // Chamar o serviço que processa e envia em lotes automaticamente
      const result = await processAndUploadMaterials(file);
      
      // Verificar se o processamento foi bem-sucedido
      if (!result.success) {
        return { success: false, message: result.message };
      }

      // Recarregar os dados após importação
      await fetchAllCoreData();
      
      // A mensagem já vem formatada do serviço com as estatísticas
      const message = result.message;

      return { 
        success: true, 
        message 
      };

    } catch (error: any) {
      console.error('❌ Erro no processo de importação:', error);
      return { 
        success: false, 
        message: `Falha na importação: ${error.message}` 
      };
    } finally {
      setLoading(false);
    }
  };

  // Funções para orçamentos
  const fetchBudgets = useCallback(async () => {
    if (!user) {

      return;
    }

    try {
      setLoadingBudgets(true);

      
      // Buscar TODOS os orçamentos usando a função helper de paginação
      const data = await fetchAllRecords(
        'budgets',
        'id, project_name, company_id, client_name, city, status, updated_at, plan_image_url, folder_id',
        'created_at',
        false,
        { user_id: user.id }
      );




      // Mapear os dados do banco para o formato do frontend
      const orcamentosFormatados: Orcamento[] = data.map(item => {
        // Normalizar o status para garantir compatibilidade
        let normalizedStatus: 'Em Andamento' | 'Finalizado' = 'Em Andamento';
        if (item.status === 'Finalizado' || item.status === 'finalized' || item.status === 'Concluído') {
          normalizedStatus = 'Finalizado';
        }
        
        return {
          id: item.id,
          nome: item.project_name || '',
          concessionariaId: item.company_id || '', // Usar company_id do banco
          company_id: item.company_id, // ID da empresa no Supabase
          dataModificacao: item.updated_at ? new Date(item.updated_at).toISOString().split('T')[0] : '',
          status: normalizedStatus,
          postes: [], // Será implementado quando conectarmos os postes
          folderId: item.folder_id || null,
          ...(item.client_name && { clientName: item.client_name }),
          ...(item.city && { city: item.city }),
          ...(item.plan_image_url && { imagemPlanta: item.plan_image_url }),
        };
      });

      setBudgets(orcamentosFormatados);
    } catch (error) {
      console.error('Erro ao buscar orçamentos:', error);
      setBudgets([]);
    } finally {
      setLoadingBudgets(false);
    }
  }, [user]);

  const uploadPlanImage = async (budgetId: string, file: File) => {
    if (!user) {

      return;
    }

    try {
      setLoadingUpload(true);


      // a. Gerar um caminho de arquivo único para evitar conflitos
      const timestamp = Date.now();
      const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const filePath = `public/budgets/${budgetId}/${timestamp}_${sanitizedFileName}`;

      // b. Fazer o upload do arquivo para o bucket 'plans'
      const { error: uploadError } = await supabase.storage
        .from('plans')
        .upload(filePath, file);

      if (uploadError) {
        // Se o bucket não existir, tentar criá-lo
        if (uploadError.message?.includes('Bucket not found')) {

          
          const { error: createBucketError } = await supabase.storage
            .createBucket('plans', {
              public: true,
              allowedMimeTypes: ['image/*', 'application/pdf'],
              fileSizeLimit: 10 * 1024 * 1024 // 10MB
            });

          if (createBucketError) {
            console.error('Erro ao criar bucket:', createBucketError);
            throw createBucketError;
          }


          
          // Tentar fazer upload novamente
          const { error: retryUploadError } = await supabase.storage
            .from('plans')
            .upload(filePath, file);

          if (retryUploadError) {
            console.error('Erro ao fazer upload do arquivo após criar bucket:', retryUploadError);
            throw retryUploadError;
          }
        } else {
          console.error('Erro ao fazer upload do arquivo:', uploadError);
          throw uploadError;
        }
      }



      // c. Obter a URL pública do arquivo
      const { data: publicUrlData } = supabase.storage
        .from('plans')
        .getPublicUrl(filePath);

      const publicUrl = publicUrlData.publicUrl;


      // d. Atualizar a tabela budgets, salvando a publicUrl na coluna plan_image_url
      const { error: updateError } = await supabase
        .from('budgets')
        .update({ plan_image_url: publicUrl })
        .eq('id', budgetId);

      if (updateError) {
        console.error('Erro ao atualizar orçamento com URL da imagem:', updateError);
        throw updateError;
      }



      // e. Atualizar o currentOrcamento no estado local para refletir a nova URL da imagem
      if (currentOrcamento && currentOrcamento.id === budgetId) {
        setCurrentOrcamento(prev => prev ? { ...prev, imagemPlanta: publicUrl } : null);
      }

      // Atualizar também a lista de budgets
      setBudgets(prev => prev.map(budget => 
        budget.id === budgetId 
          ? { ...budget, imagemPlanta: publicUrl }
          : budget
      ));

    } catch (error) {
      console.error('Erro no upload da imagem da planta:', error);
      throw error;
    } finally {
      setLoadingUpload(false);
    }
  };

  const deletePlanImage = async (budgetId: string) => {
    if (!user) {

      return;
    }

    try {
      setLoadingUpload(true);


      // Atualizar a tabela budgets, removendo a URL da imagem
      const { error: updateError } = await supabase
        .from('budgets')
        .update({ plan_image_url: null })
        .eq('id', budgetId);

      if (updateError) {
        console.error('Erro ao remover URL da imagem do orçamento:', updateError);
        throw updateError;
      }



      // Atualizar o currentOrcamento no estado local
      if (currentOrcamento && currentOrcamento.id === budgetId) {
        setCurrentOrcamento(prev => prev ? { ...prev, imagemPlanta: undefined } : null);
      }

      // Atualizar também a lista de budgets
      setBudgets(prev => prev.map(budget => 
        budget.id === budgetId 
          ? { ...budget, imagemPlanta: undefined }
          : budget
      ));

    } catch (error) {
      console.error('Erro ao deletar imagem da planta:', error);
      throw error;
    } finally {
      setLoadingUpload(false);
    }
  };

  const fetchBudgetDetails = useCallback(async (budgetId: string): Promise<BudgetDetails | null> => {
    try {
      setLoadingBudgetDetails(true);
      console.time('⏱️ Total fetchBudgetDetails');

      
      // ⚡ OTIMIZAÇÃO: Buscar dados em paralelo quando possível
      console.time('⏱️ Budget info');
      const { data: budgetData, error: budgetError } = await supabase
        .from('budgets')
        .select(`
          id,
          project_name,
          company_id,
          client_name,
          city,
          status,
          created_at,
          updated_at,
          plan_image_url,
          render_version
        `)
        .eq('id', budgetId)
        .single();
      console.timeEnd('⏱️ Budget info');

      if (budgetError) {
        console.error('ERRO DETALHADO DO SUPABASE (budget):', budgetError);
        throw budgetError;
      }
      
      // ⚡ OTIMIZAÇÃO: Query simplificada - buscar apenas campos essenciais
      console.time('⏱️ Posts query');
      const { data: postsData, error: postsError } = await supabase
        .from('budget_posts')
        .select(`
          id,
          name,
          custom_name,
          counter,
          x_coord,
          y_coord,
          post_types (
            id,
            name,
            code,
            price
          ),
          post_item_groups (
            id,
            name,
            template_id,
            post_item_group_materials (
              material_id,
              quantity,
              price_at_addition,
              materials (
                id,
                code,
                name,
                unit,
                price
              )
            )
          ),
          post_materials (
            id,
            material_id,
            quantity,
            price_at_addition,
            materials (
              id,
              code,
              name,
              unit,
              price
            )
          )
        `)
        .eq('budget_id', budgetId)
        .order('counter', { ascending: true })
        .limit(500); // ⚡ Usar limit ao invés de range
      console.timeEnd('⏱️ Posts query');

      if (postsError) {
        console.error('ERRO DETALHADO DO SUPABASE (posts):', postsError);
        console.error('Tipo do erro:', typeof postsError);
        console.error('Mensagem do erro:', postsError.message);
        console.error('Código do erro:', postsError.code);
        console.error('Detalhes do erro:', postsError.details);
        console.error('Hint do erro:', postsError.hint);
        throw postsError;
      }



      // Mapear os dados dos postes para o tipo correto
      const postsFormatted: BudgetPostDetail[] = postsData?.map(post => {
        console.log('📍 Carregando poste:', { id: post.id, name: post.name, counter: post.counter, custom_name: post.custom_name });
        return {
          id: post.id,
          name: post.name || '',
          custom_name: post.custom_name,
          counter: post.counter || 0,
          x_coord: post.x_coord || 0,
          y_coord: post.y_coord || 0,
          post_types: post.post_types ? {
          id: (post.post_types as any).id,
          name: (post.post_types as any).name || '',
          code: (post.post_types as any).code || undefined,
          description: undefined, // ⚡ Não carregado para otimização
          shape: undefined, // ⚡ Não carregado para otimização
          height_m: undefined, // ⚡ Não carregado para otimização
          price: (post.post_types as any).price || 0
        } : null,
        post_item_groups: post.post_item_groups?.map(group => ({
          id: group.id,
          name: group.name || '',
          template_id: group.template_id || undefined,
          post_item_group_materials: group.post_item_group_materials?.map(material => {
            return {
              material_id: material.material_id,
              quantity: material.quantity || 0,
              price_at_addition: material.price_at_addition || 0,
              materials: material.materials ? {
                id: (material.materials as any).id,
                code: (material.materials as any).code || '',
                name: (material.materials as any).name || '',
                description: undefined, // ⚡ Não carregado para otimização
                unit: (material.materials as any).unit || '',
                price: (material.materials as any).price || 0
              } : {
                id: '',
                code: '',
                name: 'Material não encontrado',
                description: undefined,
                unit: '',
                price: 0
              }
            };
          }) || []
        })) || [],
        post_materials: post.post_materials?.map(material => ({
          id: material.id,
          post_id: post.id,
          material_id: material.material_id,
          quantity: material.quantity || 0,
          price_at_addition: material.price_at_addition || 0,
          materials: material.materials ? {
            id: (material.materials as any).id,
            code: (material.materials as any).code || '',
            name: (material.materials as any).name || '',
            description: undefined, // ⚡ Não carregado para otimização
            unit: (material.materials as any).unit || '',
            price: (material.materials as any).price || 0
          } : {
            id: '',
            code: '',
            name: 'Material não encontrado',
            description: undefined,
            unit: '',
            price: 0
          }
        })) || []
        };
      }) || [];

      // Combinar dados do orçamento e postes em um objeto BudgetDetails
      const budgetDetails: BudgetDetails = {
        id: budgetData.id,
        name: budgetData.project_name || '',
        company_id: budgetData.company_id || undefined,
        client_name: budgetData.client_name || undefined,
        city: budgetData.city || undefined,
        status: budgetData.status || 'Em Andamento',
        created_at: budgetData.created_at || undefined,
        updated_at: budgetData.updated_at || undefined,
        plan_image_url: budgetData.plan_image_url || undefined,
        render_version: budgetData.render_version || 1,
        posts: postsFormatted
      };

      setBudgetDetails(budgetDetails);
      console.timeEnd('⏱️ Total fetchBudgetDetails');
      console.log(`✅ Orçamento carregado: ${postsFormatted.length} postes`);
      return budgetDetails;
    } catch (error) {
      console.error('❌ ERRO ao carregar orçamento:', error);
      if (error && typeof error === 'object') {
        console.error('Detalhes:', (error as any).message);
      }
      setBudgetDetails(null);
      return null;
    } finally {
      setLoadingBudgetDetails(false);
    }
  }, []);

  const fetchPostTypes = useCallback(async (forceRefresh: boolean = false) => {
    // ⚡ CACHE: Evita recarregar se já tiver dados em cache (a menos que forçado)
    if (hasFetchedPostTypes && postTypes.length > 0 && !forceRefresh) {
      console.log("💾 Usando tipos de poste do cache (", postTypes.length, "itens)");
      return;
    }

    try {
      setLoadingPostTypes(true);
      console.log("🏗️ Carregando tipos de poste do banco de dados...");

      
      // Buscar TODOS os tipos de poste usando a função helper de paginação
      const data = await fetchAllRecords('post_types', '*', 'name', true);



      // Mapear os dados do banco para o formato do frontend
      const postTypesFormatted: PostType[] = data.map(item => ({
        id: item.id,
        name: item.name || '',
        code: item.code || undefined,
        description: item.description || undefined,
        shape: item.shape || undefined,
        height_m: item.height_m || undefined,
        price: parseFloat(item.price) || 0,
      }));

      setPostTypes(postTypesFormatted);
      setHasFetchedPostTypes(true);
      console.log("✅ Tipos de poste carregados:", postTypesFormatted.length, "itens");
    } catch (error) {
      console.error('Erro ao buscar tipos de poste:', error);
      setPostTypes([]);
    } finally {
      setLoadingPostTypes(false);
    }
  }, [hasFetchedPostTypes, postTypes.length]);

  const addPostToBudget = async (newPostData: { budget_id: string; post_type_id: string; name: string; x_coord: number; y_coord: number; skipPostTypeMaterial?: boolean; }) => {
    try {
      console.log(`🔄 === SUPABASE INSERT INICIADO ===`);
      console.log(`📤 Dados sendo enviados para Supabase:`, newPostData);
      
      // Primeiro, buscar o material_id do tipo de poste
      const { data: postTypeData, error: postTypeError } = await supabase
        .from('post_types')
        .select('material_id, price')
        .eq('id', newPostData.post_type_id)
        .single();

      if (postTypeError) {
        console.error('Erro ao buscar dados do tipo de poste:', postTypeError);
        throw postTypeError;
      }
      
      // Calcular o próximo contador para este orçamento
      const { data: maxCounterData, error: maxCounterError } = await supabase
        .from('budget_posts')
        .select('counter')
        .eq('budget_id', newPostData.budget_id)
        .order('counter', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (maxCounterError) {
        console.error('Erro ao buscar contador máximo:', maxCounterError);
        throw maxCounterError;
      }
      
      const nextCounter = maxCounterData?.counter ? maxCounterData.counter + 1 : 1;
      console.log(`📊 Próximo contador: ${nextCounter}`);
      
      const { data, error } = await supabase
        .from('budget_posts')
        .insert({
          budget_id: newPostData.budget_id,
          post_type_id: newPostData.post_type_id,
          name: newPostData.name, // Mantido para compatibilidade legado
          custom_name: newPostData.name, // Nome personalizável
          counter: nextCounter, // Contador automático
          x_coord: newPostData.x_coord,
          y_coord: newPostData.y_coord,
        })
        .select(`
          *,
          post_types (
            id,
            name,
            code,
            description,
            shape,
            height_m,
            price
          )
        `)
        .single();

      if (error) {
        console.error('Erro ao adicionar poste:', error);
        throw error;
      }

      console.log(`✅ SUPABASE INSERT SUCESSO - dados retornados:`, data);

      // Primeiro, criar o material avulso no banco de dados (se existe material_id)
      // IMPORTANTE: Só adicionar se skipPostTypeMaterial não estiver definido ou for false
      let looseMaterialData = null;
      if (postTypeData.material_id && !newPostData.skipPostTypeMaterial) {
        console.log(`🔄 === ADICIONANDO MATERIAL AVULSO ===`);
        console.log(`📝 Post ID: ${data.id}`);
        console.log(`📝 Material ID: ${postTypeData.material_id}`);
        console.log(`📝 Quantidade: 1`);
        console.log(`📝 Preço: ${postTypeData.price}`);
        
        // Verificar se já existe esse material avulso para evitar duplicação
        const { data: existingMaterial, error: checkError } = await supabase
          .from('post_materials')
          .select('id')
          .eq('post_id', data.id)
          .eq('material_id', postTypeData.material_id)
          .single();

        if (checkError && checkError.code !== 'PGRST116') { // PGRST116 = row not found
          console.error('❌ Erro ao verificar material avulso existente:', checkError);
        }

        // Só adicionar se não existir
        if (!existingMaterial) {
          console.log(`🚀 Inserindo material avulso no banco...`);
          const { data: materialData, error: materialError } = await supabase
            .from('post_materials')
            .insert({
              post_id: data.id,
              material_id: postTypeData.material_id,
              quantity: 1,
              price_at_addition: postTypeData.price,
            })
            .select(`
              id,
              material_id,
              quantity,
              price_at_addition,
              materials (
                id,
                code,
                name,
                description,
                unit,
                price
              )
            `)
            .single();

          if (materialError) {
            console.error('❌ Erro ao inserir material avulso:', materialError);
          } else {
            console.log(`✅ Material avulso inserido com sucesso:`, materialData);
            looseMaterialData = materialData;
          }
        } else {
          console.log(`ℹ️ Poste já existe como material avulso, pulando...`);
        }
      } else if (newPostData.skipPostTypeMaterial) {
        console.log(`ℹ️ skipPostTypeMaterial=true - não adicionando material do tipo de poste automaticamente`);
      } else {
        console.log(`⚠️ Post type não tem material_id - não será adicionado aos materiais avulsos`);
      }

      // Mapear o novo poste para o formato dos budgetDetails (incluindo material avulso se foi criado)
      const newPostDetail: BudgetPostDetail = {
        id: data.id,
        name: data.name || '',
        counter: data.counter || 0,
        x_coord: data.x_coord || 0,
        y_coord: data.y_coord || 0,
        post_types: data.post_types ? {
          id: data.post_types.id,
          name: data.post_types.name || '',
          code: data.post_types.code || undefined,
          description: data.post_types.description || undefined,
          shape: data.post_types.shape || undefined,
          height_m: data.post_types.height_m || undefined,
          price: data.post_types.price || 0
        } : null,
        post_item_groups: [], // Novo poste não tem grupos ainda
        post_materials: looseMaterialData ? [{
          id: looseMaterialData.id,
          post_id: data.id,
          material_id: looseMaterialData.material_id,
          quantity: looseMaterialData.quantity,
          price_at_addition: looseMaterialData.price_at_addition,
          materials: looseMaterialData.materials ? {
            id: (looseMaterialData.materials as any).id,
            code: (looseMaterialData.materials as any).code || '',
            name: (looseMaterialData.materials as any).name || '',
            description: (looseMaterialData.materials as any).description || undefined,
            unit: (looseMaterialData.materials as any).unit || '',
            price: (looseMaterialData.materials as any).price || 0
          } : {
            id: '',
            code: '',
            name: 'Material não encontrado',
            description: undefined,
            unit: '',
            price: 0
          }
        }] : [] // Lista vazia se não foi criado material avulso
      };

      console.log(`🎯 Novo post mapeado com material avulso:`, {
        postId: newPostDetail.id,
        postName: newPostDetail.name,
        materialsCount: newPostDetail.post_materials.length,
        materials: newPostDetail.post_materials.map(m => m.materials?.name || 'N/A')
      });

      // Adicionar o novo poste ao estado budgetDetails de forma imutável
      setBudgetDetails(prevDetails => {
        // Verificação de segurança: Se não houver um orçamento carregado,
        // não faz nada e avisa no console.
        if (!prevDetails) {
          console.error("❌ Erro Crítico: Tentativa de adicionar poste sem um orçamento completamente carregado.");
          return prevDetails;
        }

        console.log(`🔄 Atualizando estado local - posts antes:`, prevDetails.posts.length);
        
        // Lógica correta e única:
        // Retorna o objeto de orçamento anterior, com a lista de postes atualizada.
        const updatedDetails = {
          ...prevDetails,
          posts: [...prevDetails.posts, newPostDetail],
        };
        
        console.log(`✅ Estado atualizado - posts depois:`, updatedDetails.posts.length);
        console.log(`🎉 Poste adicionado com sucesso! Materiais avulsos: ${newPostDetail.post_materials.length}`);
        
        return updatedDetails;
      });

      // Retornar o ID do poste criado
      return data.id;
    } catch (error) {
      console.error('Erro ao adicionar poste:', error);
      throw error;
    }
  };

  const addGroupToPost = async (groupId: string, postId: string) => {
    try {

      
      // a. Primeiro, buscar os dados do template de grupo
      const { data: groupTemplate, error: groupError } = await supabase
        .from('item_group_templates')
        .select('id, name, description')
        .eq('id', groupId)
        .single();

      if (groupError) {
        console.error('Erro ao buscar template do grupo:', groupError);
        throw groupError;
      }



      // b. Criar novo registro na tabela post_item_groups
      const { data: newGroupInstance, error: instanceError } = await supabase
        .from('post_item_groups')
        .insert({
          budget_post_id: postId,
          template_id: groupId,
          name: groupTemplate.name,
        })
        .select('id')
        .single();

      if (instanceError) {
        console.error('Erro ao criar instância do grupo:', instanceError);
        throw instanceError;
      }



      // c. Buscar todos os materiais e suas quantidades do template
      const { data: templateMaterials, error: materialsError } = await supabase
        .from('template_materials')
        .select(`
          material_id,
          quantity,
          materials (
            id,
            code,
            name,
            description,
            unit,
            price
          )
        `)
        .eq('template_id', groupId);

      if (materialsError) {
        console.error('Erro ao buscar materiais do template:', materialsError);
        throw materialsError;
      }



      // d. Inserção em lote na tabela post_item_group_materials
      if (templateMaterials && templateMaterials.length > 0) {
        const groupMaterialsData = templateMaterials.map(templateMaterial => ({
          post_item_group_id: newGroupInstance.id,
          material_id: templateMaterial.material_id,
          quantity: templateMaterial.quantity,
          price_at_addition: (templateMaterial.materials as any)?.price || 0,
        }));

        const { error: batchInsertError } = await supabase
          .from('post_item_group_materials')
          .insert(groupMaterialsData);

        if (batchInsertError) {
          console.error('Erro ao inserir materiais do grupo:', batchInsertError);
          throw batchInsertError;
        }


      }

      // Atualizar o estado budgetDetails localmente
      setBudgetDetails(prev => {
        if (!prev) return prev;

        return {
          ...prev,
          posts: prev.posts.map(post => {
            if (post.id === postId) {
              // Criar o novo grupo para adicionar ao poste
              const newGroup = {
                id: newGroupInstance.id,
                name: groupTemplate.name,
                template_id: groupId,
                post_item_group_materials: templateMaterials?.map(templateMaterial => ({
                  material_id: templateMaterial.material_id,
                  quantity: templateMaterial.quantity,
                  price_at_addition: (templateMaterial.materials as any)?.price || 0,
                  materials: (templateMaterial.materials as any) || {
                    id: '',
                    code: '',
                    name: 'Material não encontrado',
                    description: undefined,
                    unit: '',
                    price: 0
                  }
                })) || []
              };

              return {
                ...post,
                post_item_groups: [...post.post_item_groups, newGroup]
              };
            }
            return post;
          })
        };
      });

    } catch (error) {
      console.error('Erro ao adicionar grupo ao poste:', error);
      throw error;
    }
  };

  const deletePostFromBudget = async (postId: string) => {
    try {


      const { error } = await supabase
        .from('budget_posts')
        .delete()
        .eq('id', postId);

      if (error) {
        console.error('Erro ao excluir poste:', error);
        throw error;
      }



      // Atualizar o estado budgetDetails localmente removendo o poste
      setBudgetDetails(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          posts: prev.posts.filter(post => post.id !== postId)
        };
      });
    } catch (error) {
      console.error('Erro ao excluir poste:', error);
      throw error;
    }
  };

  const updatePostCoordinates = async (postId: string, x: number, y: number) => {
    try {
      console.log(`🔄 Atualizando coordenadas do poste ${postId}: x=${x}, y=${y}`);

      const { error } = await supabase
        .from('budget_posts')
        .update({
          x_coord: x,
          y_coord: y
        })
        .eq('id', postId);

      if (error) {
        console.error('Erro ao atualizar coordenadas do poste:', error);
        throw error;
      }

      console.log(`✅ Coordenadas atualizadas com sucesso`);

      // Atualizar o estado budgetDetails localmente
      setBudgetDetails(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          posts: prev.posts.map(post =>
            post.id === postId ? { ...post, x_coord: x, y_coord: y } : post
          )
        };
      });
    } catch (error) {
      console.error('Erro ao atualizar coordenadas do poste:', error);
      throw error;
    }
  };

  const updatePostCustomName = async (postId: string, customName: string) => {
    try {
      console.log(`🔄 Atualizando nome personalizado do poste ${postId}: ${customName}`);

      const { error } = await supabase
        .from('budget_posts')
        .update({
          custom_name: customName,
          name: customName // Atualizar também o campo legado
        })
        .eq('id', postId);

      if (error) {
        console.error('Erro ao atualizar nome personalizado do poste:', error);
        throw error;
      }

      console.log(`✅ Nome personalizado atualizado com sucesso`);

      // Atualizar o estado budgetDetails localmente
      setBudgetDetails(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          posts: prev.posts.map(post =>
            post.id === postId ? { ...post, custom_name: customName, name: customName } : post
          )
        };
      });
    } catch (error) {
      console.error('Erro ao atualizar nome personalizado do poste:', error);
      throw error;
    }
  };

  const updatePostCounter = async (postId: string, newCounter: number) => {
    try {
      console.log(`🔄 Atualizando contador do poste ${postId}: ${newCounter}`);

      // Validar que o contador seja um número positivo
      if (newCounter < 1) {
        throw new Error('O contador deve ser maior que 0');
      }

      const { error } = await supabase
        .from('budget_posts')
        .update({
          counter: newCounter
        })
        .eq('id', postId);

      if (error) {
        console.error('Erro ao atualizar contador do poste:', error);
        throw error;
      }

      console.log(`✅ Contador atualizado com sucesso`);

      // Atualizar o estado budgetDetails localmente
      setBudgetDetails(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          posts: prev.posts.map(post =>
            post.id === postId ? { ...post, counter: newCounter } : post
          )
        };
      });
    } catch (error) {
      console.error('Erro ao atualizar contador do poste:', error);
      throw error;
    }
  };

  const removeGroupFromPost = async (postGroupId: string) => {
    try {


      const { error } = await supabase
        .from('post_item_groups')
        .delete()
        .eq('id', postGroupId);

      if (error) {
        console.error('Erro ao remover grupo:', error);
        throw error;
      }



      // Atualizar o estado budgetDetails localmente removendo o grupo
      setBudgetDetails(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          posts: prev.posts.map(post => ({
            ...post,
            post_item_groups: post.post_item_groups.filter(group => group.id !== postGroupId)
          }))
        };
      });
    } catch (error) {
      console.error('Erro ao remover grupo:', error);
      throw error;
    }
  };

  const updateMaterialQuantityInPostGroup = async (postGroupId: string, materialId: string, newQuantity: number) => {
    try {


      // Validar quantidade
      if (newQuantity < 0) {
        throw new Error('Quantidade não pode ser negativa');
      }

      const { error } = await supabase
        .from('post_item_group_materials')
        .update({ quantity: newQuantity })
        .eq('post_item_group_id', postGroupId)
        .eq('material_id', materialId);

      if (error) {
        console.error('Erro ao atualizar quantidade do material:', error);
        throw error;
      }



      // Atualizar o estado budgetDetails localmente
      setBudgetDetails(prev => {
        if (!prev) return prev;

        return {
          ...prev,
          posts: prev.posts.map(post => ({
            ...post,
            post_item_groups: post.post_item_groups.map(group => {
              if (group.id === postGroupId) {
                return {
                  ...group,
                  post_item_group_materials: group.post_item_group_materials.map(material => {
                    if (material.material_id === materialId) {
                      return {
                        ...material,
                        quantity: newQuantity
                      };
                    }
                    return material;
                  })
                };
              }
              return group;
            })
          }))
        };
      });
    } catch (error) {
      console.error('Erro ao atualizar quantidade do material:', error);
      throw error;
    }
  };

  // Função para remover material de um grupo de itens do poste
  const removeMaterialFromPostGroup = async (postGroupId: string, materialId: string) => {
    try {
      const { error } = await supabase
        .from('post_item_group_materials')
        .delete()
        .eq('post_item_group_id', postGroupId)
        .eq('material_id', materialId);

      if (error) {
        console.error('Erro ao remover material do grupo:', error);
        throw error;
      }

      // Atualizar o estado budgetDetails localmente
      setBudgetDetails(prev => {
        if (!prev) return prev;

        return {
          ...prev,
          posts: prev.posts.map(post => ({
            ...post,
            post_item_groups: post.post_item_groups.map(group => {
              if (group.id === postGroupId) {
                return {
                  ...group,
                  post_item_group_materials: group.post_item_group_materials.filter(
                    material => material.material_id !== materialId
                  )
                };
              }
              return group;
            })
          }))
        };
      });
    } catch (error) {
      console.error('Erro ao remover material do grupo:', error);
      throw error;
    }
  };

  // Função para adicionar material avulso ao poste (usado quando usuário adiciona manualmente)
  const addLooseMaterialToPost = async (postId: string, materialId: string, quantity: number, price: number) => {
    try {
      const { data, error } = await supabase
        .from('post_materials')
        .insert({
          post_id: postId,
          material_id: materialId,
          quantity,
          price_at_addition: price,
        })
        .select(`
          id,
          material_id,
          quantity,
          price_at_addition,
          materials (
            id,
            code,
            name,
            description,
            unit,
            price
          )
        `)
        .single();

      if (error) {
        console.error('Erro ao inserir material avulso:', error);
        throw error;
      }

      // Atualizar o estado budgetDetails localmente
      setBudgetDetails(prev => {
        if (!prev) return prev;

        return {
          ...prev,
          posts: prev.posts.map(post => {
            if (post.id === postId) {
              const newLooseMaterial = {
                id: data.id,
                post_id: postId,
                material_id: data.material_id,
                quantity: data.quantity,
                price_at_addition: data.price_at_addition,
                materials: data.materials ? {
                  id: (data.materials as any).id,
                  code: (data.materials as any).code || '',
                  name: (data.materials as any).name || '',
                  description: (data.materials as any).description || undefined,
                  unit: (data.materials as any).unit || '',
                  price: (data.materials as any).price || 0
                } : {
                  id: '',
                  code: '',
                  name: 'Material não encontrado',
                  description: undefined,
                  unit: '',
                  price: 0
                }
              };

              return {
                ...post,
                post_materials: [...post.post_materials, newLooseMaterial]
              };
            }
            return post;
          })
        };
      });
    } catch (error) {
      console.error('Erro ao adicionar material avulso:', error);
      throw error;
    }
  };

  // Função para atualizar quantidade de material avulso
  const updateLooseMaterialQuantity = async (postMaterialId: string, newQuantity: number) => {
    try {


      // Validar quantidade
      if (newQuantity < 0) {
        throw new Error('Quantidade não pode ser negativa');
      }

      const { error } = await supabase
        .from('post_materials')
        .update({ quantity: newQuantity })
        .eq('id', postMaterialId);

      if (error) {
        console.error('Erro ao atualizar quantidade do material avulso:', error);
        throw error;
      }



      // Atualizar o estado budgetDetails localmente
      setBudgetDetails(prev => {
        if (!prev) return prev;

        return {
          ...prev,
          posts: prev.posts.map(post => ({
            ...post,
            post_materials: post.post_materials.map(material => {
              if (material.id === postMaterialId) {
                return {
                  ...material,
                  quantity: newQuantity
                };
              }
              return material;
            })
          }))
        };
      });
    } catch (error) {
      console.error('Erro ao atualizar quantidade do material avulso:', error);
      throw error;
    }
  };

  // Função para remover material avulso do poste
  const removeLooseMaterialFromPost = async (postMaterialId: string) => {
    try {


      const { error } = await supabase
        .from('post_materials')
        .delete()
        .eq('id', postMaterialId);

      if (error) {
        console.error('Erro ao remover material avulso:', error);
        throw error;
      }



      // Atualizar o estado budgetDetails localmente
      setBudgetDetails(prev => {
        if (!prev) return prev;

        return {
          ...prev,
          posts: prev.posts.map(post => ({
            ...post,
            post_materials: post.post_materials.filter(material => material.id !== postMaterialId)
          }))
        };
      });
    } catch (error) {
      console.error('Erro ao remover material avulso:', error);
      throw error;
    }
  };

  // Função para atualizar preços consolidados de um material em todo o orçamento
  const updateConsolidatedMaterialPrice = async (budgetId: string, materialId: string, newPrice: number) => {
    try {
      // Validar preço
      if (newPrice < 0) {
        throw new Error('Preço não pode ser negativo');
      }

      // Buscar todos os postes do orçamento
      const { data: posts, error: postsError } = await supabase
        .from('budget_posts')
        .select('id')
        .eq('budget_id', budgetId)
        .range(0, 500); // Limite de 500 postes por orçamento (otimizado)

      if (postsError) throw postsError;
      if (!posts || posts.length === 0) return;

      const postIds = posts.map(p => p.id);

      // Buscar todos os IDs de post_item_groups dos postes
      const { data: postGroups, error: groupsError } = await supabase
        .from('post_item_groups')
        .select('id')
        .in('budget_post_id', postIds)
        .range(0, 2000); // Limite de 2000 grupos (500 postes x ~4 grupos média)

      if (!groupsError && postGroups && postGroups.length > 0) {
        const groupIds = postGroups.map(g => g.id);

        // Atualizar price_at_addition em post_item_group_materials
        await supabase
          .from('post_item_group_materials')
          .update({ price_at_addition: newPrice })
          .eq('material_id', materialId)
          .in('post_item_group_id', groupIds);
      }

      // Atualizar price_at_addition em post_materials (materiais avulsos)
      await supabase
        .from('post_materials')
        .update({ price_at_addition: newPrice })
        .eq('material_id', materialId)
        .in('post_id', postIds);

      // Atualizar o estado budgetDetails localmente
      setBudgetDetails(prev => {
        if (!prev) return prev;

        return {
          ...prev,
          posts: prev.posts.map(post => ({
            ...post,
            post_item_groups: post.post_item_groups.map(group => ({
              ...group,
              post_item_group_materials: group.post_item_group_materials.map(material => {
                if (material.material_id === materialId) {
                  return {
                    ...material,
                    price_at_addition: newPrice
                  };
                }
                return material;
              })
            })),
            post_materials: post.post_materials.map(material => {
              if (material.material_id === materialId) {
                return {
                  ...material,
                  price_at_addition: newPrice
                };
              }
              return material;
            })
          }))
        };
      });

      console.log('✅ Preço atualizado:', { materialId, newPrice });
    } catch (error) {
      console.error('❌ Erro ao atualizar preço:', error);
      throw error;
    }
  };

  // Funções para concessionárias
  const fetchUtilityCompanies = useCallback(async () => {
    try {
      setLoadingCompanies(true);

      
      // Buscar TODAS as concessionárias usando a função helper de paginação
      const data = await fetchAllRecords('utility_companies', '*', 'name', true);



      // Mapear os dados do banco para o formato do frontend
      const concessionariasFormatadas: Concessionaria[] = data.map(item => ({
        id: item.id,
        nome: item.name || '',
        sigla: item.name || '', // Usando name como sigla até termos campo específico
      }));

      setUtilityCompanies(concessionariasFormatadas);
    } catch (error) {
      console.error('Erro ao buscar concessionárias:', error);
      setUtilityCompanies([]);
    } finally {
      setLoadingCompanies(false);
    }
  }, []);

  // Funções para grupos de itens
  const fetchItemGroups = useCallback(async (companyId: string) => {
    try {
      setLoadingGroups(true);

      
      // Buscar templates de grupos para a empresa
      const { data: templatesData, error: templatesError } = await supabase
        .from('item_group_templates')
        .select(`
          id,
          name,
          description,
          company_id,
          template_materials (
            material_id,
            quantity,
            materials (
              id,
              code,
              name,
              price,
              unit
            )
          )
        `, { count: 'exact' })
        .eq('company_id', companyId)
        .range(0, 200); // Limite de 200 grupos por concessionária (otimizado)

      if (templatesError) {
        console.error('Erro ao buscar templates de grupos:', templatesError);
        throw templatesError;
      }



      // Mapear os dados do banco para o formato do frontend
      const gruposFormatados: GrupoItem[] = templatesData?.map(template => ({
        id: template.id,
        nome: template.name || '',
        descricao: template.description || '',
        concessionariaId: template.company_id,
        materiais: template.template_materials?.map(tm => ({
          materialId: tm.material_id,
          quantidade: tm.quantity,
        })) || []
      })) || [];


      setItemGroups(gruposFormatados);
    } catch (error) {
      console.error('Erro ao buscar grupos de itens:', error);
      setItemGroups([]);
    } finally {
      setLoadingGroups(false);
    }
  }, []);

  const addGrupoItem = (grupo: Omit<GrupoItem, 'id'>) => {
    const newGrupo = { ...grupo, id: Date.now().toString() };
    setGruposItens(prev => [...prev, newGrupo]);
  };

  const updateGrupoItem = (id: string, grupo: Omit<GrupoItem, 'id'>) => {
    setGruposItens(prev => prev.map(g => g.id === id ? { ...grupo, id } : g));
  };

  const deleteGrupoItem = (id: string) => {
    setGruposItens(prev => prev.filter(g => g.id !== id));
  };

  const addOrcamento = (orcamento: Omit<Orcamento, 'id'>) => {
    const newOrcamento = { ...orcamento, id: Date.now().toString() };
    setOrcamentos(prev => [...prev, newOrcamento]);
  };

  const updateOrcamento = (id: string, updates: Partial<Orcamento>) => {
    setOrcamentos(prev => prev.map(o => o.id === id ? { ...o, ...updates } : o));
    if (currentOrcamento && currentOrcamento.id === id) {
      setCurrentOrcamento(prev => prev ? { ...prev, ...updates } : null);
    }
  };

  // Funções para sistema de pastas
  const fetchFolders = useCallback(async () => {
    if (!user) {
      return;
    }

    try {
      setLoadingFolders(true);

      const { data, error } = await supabase
        .from('budget_folders')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Erro ao buscar pastas:', error);
        throw error;
      }

      const foldersFormatted: BudgetFolder[] = data?.map(folder => ({
        id: folder.id,
        name: folder.name,
        color: folder.color || undefined,
        parentId: folder.parent_id || null,
        userId: folder.user_id,
        createdAt: folder.created_at,
        updatedAt: folder.updated_at,
      })) || [];

      setFolders(foldersFormatted);
    } catch (error) {
      console.error('Erro ao buscar pastas:', error);
      setFolders([]);
    } finally {
      setLoadingFolders(false);
    }
  }, [user]);

  // Função para navegar entre pastas
  const navigateToFolder = (folderId: string | null) => {
    setCurrentFolderId(folderId);
  };

  // Função auxiliar para obter o caminho (breadcrumb) da pasta atual
  const getFolderPath = (folderId: string | null): BudgetFolder[] => {
    if (!folderId) return [];
    
    const path: BudgetFolder[] = [];
    let currentId: string | null | undefined = folderId;
    
    while (currentId) {
      const folder = folders.find(f => f.id === currentId);
      if (!folder) break;
      
      path.unshift(folder);
      currentId = folder.parentId;
    }
    
    return path;
  };

  // Função auxiliar para verificar se uma pasta é descendente de outra
  const isFolderDescendant = (possibleDescendantId: string, ancestorId: string): boolean => {
    if (possibleDescendantId === ancestorId) return true;
    
    const descendantPath = getFolderPath(possibleDescendantId);
    return descendantPath.some(folder => folder.id === ancestorId);
  };

  // Função centralizada para buscar todos os dados essenciais
  const fetchAllCoreData = useCallback(async () => {
    console.log("🔄 Sincronizando dados essenciais com o banco de dados...");
    setLoading(true);
    try {
      // ⚡ OTIMIZAÇÃO: Carregar apenas dados críticos para o dashboard inicial
      // Materiais e PostTypes serão carregados sob demanda quando necessários
      await Promise.all([
        fetchBudgets(),
        fetchUtilityCompanies(),
        fetchFolders(),
      ]);

      console.log("✅ Sincronização dos dados essenciais concluída");
      console.log("💡 Materiais e tipos de poste serão carregados sob demanda");
    } catch (error) {
      console.error("❌ Falha ao sincronizar dados essenciais:", error);
    } finally {
      setLoading(false);
    }
  }, [fetchBudgets, fetchUtilityCompanies, fetchFolders]);

  // Carregar orçamentos e dados essenciais assim que o usuário estiver logado (evita lista vazia em produção)
  useEffect(() => {
    if (user?.id) {
      fetchAllCoreData();
    }
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps -- fetchAllCoreData está estável; só reagir ao user

  // Se não estiver inicializado ainda, mostra loading
  if (!isInitialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-sm text-gray-600">Inicializando aplicação...</p>
        </div>
      </div>
    );
  }

  return (
    <AppContext.Provider value={{
      materiais,
      gruposItens,
      concessionarias,
      orcamentos,
      budgets,
      budgetDetails,
      postTypes,
      currentOrcamento,
      currentView,
      activeModule,
      setActiveModule,
      loadingMaterials,
      loadingBudgets,
      loadingBudgetDetails,
      loadingPostTypes,
      loadingUpload,
      loading,
      
      // Novos estados para gerenciar grupos
      utilityCompanies,
      itemGroups,
      loadingCompanies,
      loadingGroups,
      currentGroup,
      
      // Estados para sistema de pastas
      folders,
      loadingFolders,
      currentFolderId,
      
      setCurrentView,
      setCurrentOrcamento,
      setCurrentGroup,
      
      // Funções de sincronização
      fetchAllCoreData,
      
      // Funções de materiais
      fetchMaterials,
      deleteAllMaterials,
      importMaterialsFromCSV,
      
      // Funções de orçamentos
      fetchBudgets,
      fetchBudgetDetails,
      uploadPlanImage,
      deletePlanImage,
      
      // Funções de tipos de poste
      fetchPostTypes,
      addPostToBudget,
      addGroupToPost,
      deletePostFromBudget,
      updatePostCoordinates,
      updatePostCustomName,
      updatePostCounter,
      removeGroupFromPost,
      updateMaterialQuantityInPostGroup,
      removeMaterialFromPostGroup,
      
      // Funções para materiais avulsos
      addLooseMaterialToPost,
      updateLooseMaterialQuantity,
      removeLooseMaterialFromPost,
      
      // Função para atualizar preços consolidados
      updateConsolidatedMaterialPrice,
      
      // Funções para concessionárias e grupos
      fetchUtilityCompanies,
      fetchItemGroups,
      
      // Funções para sistema de pastas
      fetchFolders,
      navigateToFolder,
      getFolderPath,
      isFolderDescendant,
      
      // Funções locais (legacy)
      addGrupoItem,
      updateGrupoItem,
      deleteGrupoItem,
      addOrcamento,
      updateOrcamento,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}