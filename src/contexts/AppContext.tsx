"use client";
import { createContext, useContext, useState, ReactNode, useCallback, useEffect } from 'react';
import { Material, GrupoItem, Concessionaria, Orcamento, BudgetPostDetail, BudgetDetails, PostType, BudgetFolder, PoleStandard, MaterialSubgroupEntity } from '@/types';
import { gruposItens as initialGrupos, concessionarias, orcamentos as initialOrcamentos } from '@/data/mockData';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from './AuthContext';
import { processAndUploadMaterials } from '@/services/materialImportService';
import { syncMaterialPriceAction } from '@/actions/materials';
// Instrumentação temporária da abertura de orçamento — no-op enquanto
// desligada. Ver src/lib/perf/openBudget.ts para como ligar e ler.
import { perfEnabled, perfEvent, perfJsonKb, perfPhase } from '@/lib/perf/openBudget';

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

  // Estados para subgrupos de materiais
  materialSubgroups: MaterialSubgroupEntity[];
  loadingMaterialSubgroups: boolean;

  // Estados para padrões de poste (grupo de grupos de itens)
  poleStandards: PoleStandard[];
  loadingPoleStandards: boolean;
  currentPoleStandard: PoleStandard | null;

  // Estados para sistema de pastas
  folders: BudgetFolder[];
  loadingFolders: boolean;
  currentFolderId: string | null;
  
  activeModule: string | null;
  setActiveModule: (module: string | null) => void;
  setCurrentView: (view: string) => void;
  setCurrentOrcamento: (orcamento: Orcamento | null) => void;
  setCurrentGroup: (group: GrupoItem | null) => void;
  setCurrentPoleStandard: (standard: PoleStandard | null) => void;

  // Funções de sincronização
  fetchAllCoreData: () => Promise<void>;
  
  // Funções de materiais
  fetchMaterials: (forceRefresh?: boolean) => Promise<void>;
  deleteAllMaterials: () => Promise<void>;
  importMaterialsFromCSV: (file: File) => Promise<{ success: boolean; message: string }>;
  
  // Funções de orçamentos
  fetchBudgets: () => Promise<void>;
  fetchBudgetDetails: (budgetId: string, forceRefresh?: boolean) => Promise<BudgetDetails | null>;
  uploadPlanImage: (budgetId: string, file: File) => Promise<void>;
  deletePlanImage: (budgetId: string) => Promise<void>;
  
  // Funções de tipos de poste
  fetchPostTypes: () => Promise<void>;
  addPostToBudget: (newPostData: { budget_id: string; post_type_id: string; name: string; x_coord: number; y_coord: number; skipPostTypeMaterial?: boolean; postTypeMaterialId?: string; postTypePrice?: number; pole_standard_id?: string; segment_id?: string | null; }) => Promise<string>;
  addGroupToPost: (groupId: string, postId: string, poleStandardId?: string) => Promise<void>;
  deletePostFromBudget: (postId: string) => Promise<void>;
  updatePostCoordinates: (postId: string, x: number, y: number) => Promise<void>;
  updatePostCustomName: (postId: string, customName: string) => Promise<void>;
  updatePostCounter: (postId: string, newCounter: number) => Promise<void>;
  removeGroupFromPost: (postGroupId: string) => Promise<void>;
  updateMaterialQuantityInPostGroup: (postGroupId: string, materialId: string, newQuantity: number) => Promise<void>;
  removeMaterialFromPostGroup: (postGroupId: string, materialId: string) => Promise<void>;
  
  // Funções para materiais avulsos
  addLooseMaterialToPost: (postId: string, materialId: string, quantity: number, price: number, poleStandardId?: string) => Promise<void>;
  updateLooseMaterialQuantity: (postMaterialId: string, newQuantity: number) => Promise<void>;
  removeLooseMaterialFromPost: (postMaterialId: string) => Promise<void>;
  
  // Função para atualizar preços consolidados
  updateConsolidatedMaterialPrice: (budgetId: string, materialId: string, newPrice: number) => Promise<void>;

  // Função para remover material de todas as ocorrências no orçamento (Painel Consolidado)
  removeMaterialFromBudget: (budgetId: string, materialId: string) => Promise<void>;
  
  // Funções para subgrupos de materiais
  fetchMaterialSubgroups: () => Promise<void>;

  // Funções para concessionárias e grupos
  fetchUtilityCompanies: () => Promise<void>;
  fetchItemGroups: (companyId: string) => Promise<void>;
  // Busca grupos de itens de várias concessionárias de uma vez (usado pelo
  // editor de padrão de poste, que pode ser compartilhado entre várias)
  fetchItemGroupsByCompanies: (companyIds: string[]) => Promise<void>;

  // Funções para padrões de poste
  fetchPoleStandards: (companyId: string) => Promise<void>;

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
 *
 * A primeira página já pede `count: 'exact'` — e usa o total para disparar as
 * páginas restantes em PARALELO (`Promise.all`), em vez do `while` sequencial
 * que havia antes. Para `materials` (2.469 linhas, 3 páginas), isso trocava 3
 * idas e voltas ao banco, uma esperando a outra terminar, por 2 (a primeira, e
 * depois as duas restantes ao mesmo tempo) — e o `count` pedido deixa de ser
 * jogado fora: antes a condição de parada olhava só `data.length === pageSize`.
 *
 * `.order(orderBy)` sozinho NÃO é suficiente para paginar: `created_at` tem
 * lotes de até 200 linhas com o mesmo instante exato (import em massa), e
 * Postgres não garante ordem entre empates — a mesma linha podia cair em duas
 * páginas e outra sumir no meio. Confirmado testando contra dados reais antes
 * de trocar para paralelo (que expõe o problema mais cedo que o `while`
 * sequencial, mas o risco já existia). `id` como desempate final resolve:
 * dois UUIDs nunca colidem, então a fronteira de cada página fica fixa.
 */
async function fetchAllRecords(
  tableName: string,
  selectQuery: string = '*',
  orderBy: string = 'created_at',
  ascending: boolean = false,
  filters?: any
): Promise<any[]> {
  const pageSize = 1000;

  const buildQuery = (from: number, to: number) => {
    let query = supabase
      .from(tableName)
      .select(selectQuery, { count: 'exact' })
      .order(orderBy, { ascending })
      .order('id', { ascending: true })
      .range(from, to);

    if (filters) {
      Object.keys(filters).forEach(key => {
        query = query.eq(key, filters[key]);
      });
    }

    return query;
  };

  const fimPrimeira = perfPhase(`rede:${tableName} (pág. 1)`);
  const { data: firstPage, count, error: firstError } = await buildQuery(0, pageSize - 1);
  fimPrimeira({
    KB: perfJsonKb(firstPage),
    linhas: firstPage?.length ?? 0,
    total_na_tabela: count ?? null,
  });

  if (firstError) {
    console.error(`Erro ao buscar registros de "${tableName}":`, firstError);
    throw firstError;
  }

  const rows: any[] = firstPage ?? [];
  const total = count ?? rows.length;

  if (rows.length < pageSize || total <= pageSize) {
    return rows;
  }

  const remainingPages = Math.ceil(total / pageSize) - 1;
  const fimResto = perfPhase(`rede:${tableName} (págs. 2..${remainingPages + 1}, paralelas)`);
  const rest = await Promise.all(
    Array.from({ length: remainingPages }, (_, i) => {
      const from = (i + 1) * pageSize;
      return buildQuery(from, from + pageSize - 1);
    }),
  );
  fimResto({ paginas: remainingPages });

  for (const page of rest) {
    if (page.error) {
      console.error(`Erro ao buscar registros de "${tableName}":`, page.error);
      throw page.error;
    }
    if (page.data) rows.push(...page.data);
  }

  return rows;
}

/**
 * Buscas em voo, por chave.
 *
 * Os caches deste contexto (`hasFetchedMaterials` e afins) só barram uma
 * segunda busca depois que a primeira TERMINOU e gravou o estado. Enquanto ela
 * está no ar, o portão está aberto: dois chamadores simultâneos passam os dois
 * e disparam duas cargas completas na rede. Medido na abertura de um orçamento
 * de 280 postes: `budget_posts` (2,3 MB) baixado DUAS vezes, `materials` seis
 * (3 páginas × 2), e as duas cópias ainda competem entre si — a segunda passada
 * de postes levou 3.715ms contra 2.273ms da primeira.
 *
 * Aqui o segundo chamador recebe a MESMA promise do primeiro, em vez de abrir
 * outra requisição. A entrada sai do mapa quando a promise assenta, então a
 * próxima chamada de verdade (um refresh, outro orçamento) busca normalmente.
 *
 * Fora do componente de propósito: precisa sobreviver ao ciclo
 * monta/desmonta/remonta que o StrictMode faz em desenvolvimento — que é
 * justamente onde o problema aparece dobrado.
 */
const buscasEmVoo = new Map<string, Promise<unknown>>();

/**
 * @param forcar Ignora o que estiver em voo e começa uma busca nova.
 *
 * Obrigatório em recarga-após-escrita (`fetchMaterials(true)` depois de
 * sincronizar um preço, por exemplo): uma busca que JÁ estava no ar quando a
 * escrita aconteceu carrega o dado de antes dela. Pendurar o refresh nessa
 * busca devolveria o preço velho e a tela mentiria sobre o que foi salvo.
 */
function deduplicar<T>(chave: string, executar: () => Promise<T>, forcar = false): Promise<T> {
  if (!forcar) {
    const emVoo = buscasEmVoo.get(chave);
    if (emVoo) return emVoo as Promise<T>;
  }

  const promise = executar();
  buscasEmVoo.set(chave, promise);

  // A checagem de identidade impede que uma busca antiga, ao terminar, apague
  // do mapa a busca forçada que tomou o lugar dela.
  const limpar = () => {
    if (buscasEmVoo.get(chave) === promise) buscasEmVoo.delete(chave);
  };
  // Dois handlers em vez de `.finally`: quem trata o erro de verdade é o
  // chamador original; aqui só se limpa o mapa, sem virar rejeição não tratada.
  promise.then(limpar, limpar);

  return promise;
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

  // Estados para subgrupos de materiais
  const [materialSubgroups, setMaterialSubgroups] = useState<MaterialSubgroupEntity[]>([]);
  const [loadingMaterialSubgroups, setLoadingMaterialSubgroups] = useState<boolean>(false);

  // Estados para padrões de poste (grupo de grupos de itens)
  const [poleStandards, setPoleStandards] = useState<PoleStandard[]>([]);
  const [loadingPoleStandards, setLoadingPoleStandards] = useState<boolean>(false);
  const [currentPoleStandard, setCurrentPoleStandard] = useState<PoleStandard | null>(null);

  // Estados para sistema de pastas
  const [folders, setFolders] = useState<BudgetFolder[]>([]);
  const [loadingFolders, setLoadingFolders] = useState<boolean>(false);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null); // null = raiz

  // Efeito para inicializar o AppContext apenas após o AuthContext estar estável
  useEffect(() => {
    perfEvent('gate:AppProvider hidratou (spinner na tela)');
    // Pequeno delay para garantir que o AuthContext esteja completamente inicializado
    const timer = setTimeout(() => {
      perfEvent('gate:AppProvider liberou a árvore (fim dos 100ms)');
      setIsInitialized(true);
    }, 100);

    return () => clearTimeout(timer);
  }, []);


  const fetchMaterials = useCallback(async (forceRefresh: boolean = false) => {
    // ⚡ CACHE: Evita recarregar se já tiver dados em cache (a menos que forçado)
    if (hasFetchedMaterials && materiais.length > 0 && !forceRefresh) {
      return;
    }

    return deduplicar('materials', async () => {
    const fimMateriais = perfPhase('catálogo:fetchMaterials (só as colunas usadas)');
    try {
      setLoadingMaterials(true);

      // Colunas explícitas, não `*`.
      //
      // O `*` trazia 18 colunas por linha quando o mapeamento abaixo usa 11.
      // As 7 extras não são de graça: `description` é texto livre (a maior
      // coluna da tabela) e `embedding` é um `vector` que o PostgREST
      // serializa como array de floats em JSON — hoje está todo NULL, mas no
      // dia em que a busca semântica preencher, `*` viraria dezenas de MB
      // nesta rota sem ninguém mudar uma linha aqui. Medido nos 2.470
      // materiais da base: 1.592 KB com `*` contra ~505 KB assim.
      //
      // `descricao` do frontend vem de `name`, NÃO de `description` — por isso
      // `description` fica de fora sem perder nada na tela.
      const allMaterials = await fetchAllRecords(
        'materials',
        'id, code, name, price, unit, subgroup_id, price_source_supplier_name, price_source_supplier_id, price_source_quote_id, price_source_session_id, price_source_updated_at',
        'created_at',
        false
      );
      fimMateriais({ KB: perfJsonKb(allMaterials), linhas: allMaterials.length });

      // Mapear os dados do banco para o formato do frontend
      const materiaisFormatados: Material[] = allMaterials.map(item => ({
        id: item.id,
        codigo: item.code || '',
        descricao: item.name || '',
        precoUnit: parseFloat(item.price) || 0,
        unidade: item.unit || '',
        subgrupoId: item.subgroup_id ?? null,
        priceSourceSupplierName: item.price_source_supplier_name ?? null,
        priceSourceSupplierId: item.price_source_supplier_id ?? null,
        priceSourceQuoteId: item.price_source_quote_id ?? null,
        priceSourceSessionId: item.price_source_session_id ?? null,
        priceSourceUpdatedAt: item.price_source_updated_at ?? null,
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
    } catch (error) {
      console.error('Erro ao buscar materiais:', error);
      // Em caso de erro, mantém a lista vazia
      setMateriais([]);
    } finally {
      setLoadingMaterials(false);
    }
    }, forceRefresh);
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
        'id, project_name, company_id, client_name, city, status, updated_at, plan_image_url, folder_id, is_template, template_source_id',
        'created_at',
        false
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
          isTemplate: item.is_template || false,
          templateSourceId: item.template_source_id || null,
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

  const fetchBudgetDetails = useCallback(async (
    budgetId: string,
    forceRefresh: boolean = false
  ): Promise<BudgetDetails | null> => {
    return deduplicar(`budgetDetails:${budgetId}`, async () => {
    try {
      setLoadingBudgetDetails(true);

      
      const fimQueryOrcamento = perfPhase('detalhes:query-orçamento');
      // A consulta pesada da abertura: postes + grupos + materiais aninhados.
      const fimQueryPostes = perfPhase('detalhes:query-postes (a pesada)');

      // As duas consultas são disparadas JUNTAS de propósito. Elas não dependem
      // uma da outra — só do `budgetId`, que já está em mãos. Antes a dos postes
      // esperava a do orçamento terminar, e como a de UMA linha estava levando
      // ~1,4s (medido), a consulta pesada só começava a 1,4s da abertura. Nada
      // ali precisava ser sequencial.
      const [
        { data: budgetData, error: budgetError },
        { data: postsData, error: postsError },
      ] = await Promise.all([
        supabase
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
          .single()
          .then((r) => {
            fimQueryOrcamento();
            return r;
          }),
        // ⚡ OTIMIZAÇÃO: Query simplificada - buscar apenas campos essenciais
        supabase
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
              price_at_addition
            )
          ),
          post_materials (
            id,
            material_id,
            quantity,
            price_at_addition
          )
        `)
        .eq('budget_id', budgetId)
        .order('counter', { ascending: true })
        .limit(2000),
      ]);

      if (budgetError) {
        console.error('ERRO DETALHADO DO SUPABASE (budget):', budgetError);
        throw budgetError;
      }

      // Quantas linhas aninhadas vieram, e quantos materiais DISTINTOS existem
      // de fato: a diferença entre os dois é a duplicação do payload. A varredura
      // fica atrás do flag — com o perfilador desligado não custa nada.
      if (perfEnabled()) {
        let grupos = 0;
        let materiaisDeGrupo = 0;
        let materiaisAvulsos = 0;
        const idsDistintos = new Set<string>();
        for (const post of postsData ?? []) {
          grupos += post.post_item_groups?.length ?? 0;
          materiaisAvulsos += post.post_materials?.length ?? 0;
          for (const grupo of post.post_item_groups ?? []) {
            materiaisDeGrupo += grupo.post_item_group_materials?.length ?? 0;
            for (const m of grupo.post_item_group_materials ?? []) idsDistintos.add(m.material_id);
          }
          for (const m of post.post_materials ?? []) idsDistintos.add(m.material_id);
        }
        fimQueryPostes({
          KB: perfJsonKb(postsData),
          postes: postsData?.length ?? 0,
          grupos,
          materiais_de_grupo: materiaisDeGrupo,
          materiais_avulsos: materiaisAvulsos,
          materiais_distintos: idsDistintos.size,
          objetos_material_no_json: materiaisDeGrupo + materiaisAvulsos,
        });
      } else {
        fimQueryPostes();
      }

      if (postsError) {
        console.error('ERRO DETALHADO DO SUPABASE (posts):', postsError);
        console.error('Tipo do erro:', typeof postsError);
        console.error('Mensagem do erro:', postsError.message);
        console.error('Código do erro:', postsError.code);
        console.error('Detalhes do erro:', postsError.details);
        console.error('Hint do erro:', postsError.hint);
        throw postsError;
      }

      // Catálogo dos materiais DESTE orçamento, buscado à parte.
      //
      // A query acima costumava embutir o objeto `materials` inteiro em cada
      // linha de material. Como o mesmo material se repete em dezenas de postes,
      // isso inflava o payload sem acrescentar informação: medido num orçamento
      // de 115 postes, 94 materiais distintos apareciam 2.603 vezes — 798 KB,
      // dos quais ~500 KB eram cópia. No de 280 postes eram 100 distintos em
      // 6.404 cópias, 2,33 MB. Aqui cada material vem UMA vez e o objeto por
      // linha é remontado abaixo, com o mesmo formato de antes.
      const idsUsados = new Set<string>();
      for (const post of postsData ?? []) {
        for (const grupo of post.post_item_groups ?? []) {
          for (const m of grupo.post_item_group_materials ?? []) idsUsados.add(m.material_id);
        }
        for (const m of post.post_materials ?? []) idsUsados.add(m.material_id);
      }

      const fimQueryMateriais = perfPhase('detalhes:query-materiais-do-orçamento (distintos)');
      // Em blocos: os ids vão na URL do `.in()`, e o maior orçamento da base tem
      // 185 materiais distintos (~7 KB de URL só de UUID). 100 por requisição
      // mantém folga confortável e no caso comum (média 79) é uma só.
      const TAMANHO_BLOCO = 100;
      const blocos: string[][] = [];
      const todosIds = [...idsUsados];
      for (let i = 0; i < todosIds.length; i += TAMANHO_BLOCO) {
        blocos.push(todosIds.slice(i, i + TAMANHO_BLOCO));
      }

      const resultadosMateriais = await Promise.all(
        blocos.map((bloco) =>
          supabase
            .from('materials')
            .select('id, code, name, unit, price, subgroup_id, material_subgroups ( name )')
            .in('id', bloco)
        )
      );
      fimQueryMateriais({ distintos: idsUsados.size, requisicoes: blocos.length });

      const catalogo = new Map<string, any>();
      for (const resultado of resultadosMateriais) {
        if (resultado.error) {
          console.error('ERRO DETALHADO DO SUPABASE (materiais do orçamento):', resultado.error);
          throw resultado.error;
        }
        for (const material of resultado.data ?? []) catalogo.set(material.id, material);
      }

      /**
       * Reconstrói o objeto `materials` que antes vinha embutido na linha.
       *
       * Devolve uma instância NOVA a cada chamada, em vez de compartilhar a do
       * catálogo entre as linhas que apontam para o mesmo material. É o que
       * mantém o comportamento idêntico ao de antes: se algum ponto do app
       * mutar esse objeto, a mutação não pode vazar para os outros postes.
       *
       * O material ausente cai no mesmo registro de "não encontrado" que a
       * query aninhada produzia quando o embed vinha nulo.
       */
      const resolverMaterial = (materialId: string) => {
        const encontrado = catalogo.get(materialId);
        if (!encontrado) {
          return {
            id: '',
            code: '',
            name: 'Material não encontrado',
            description: undefined,
            unit: '',
            price: 0,
            subgroup_id: null,
            material_subgroups: null,
          };
        }
        return {
          id: encontrado.id,
          code: encontrado.code || '',
          name: encontrado.name || '',
          description: undefined, // ⚡ Não carregado para otimização
          unit: encontrado.unit || '',
          price: encontrado.price || 0,
          subgroup_id: encontrado.subgroup_id ?? null,
          material_subgroups: encontrado.material_subgroups ?? null,
        };
      };

      // Mapear os dados dos postes para o tipo correto
      const fimMapeamento = perfPhase('detalhes:map em JS (aloca 1 objeto por linha aninhada)');
      const postsFormatted: BudgetPostDetail[] = postsData?.map(post => {
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
              materials: resolverMaterial(material.material_id)
            };
          }) || []
        })) || [],
        post_materials: post.post_materials?.map(material => ({
          id: material.id,
          post_id: post.id,
          material_id: material.material_id,
          quantity: material.quantity || 0,
          price_at_addition: material.price_at_addition || 0,
          materials: resolverMaterial(material.material_id)
        })) || []
        };
      }) || [];
      fimMapeamento({ postes: postsFormatted.length });

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

      perfEvent('dados:budgetDetails-no-estado');
      setBudgetDetails(budgetDetails);
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
    }, forceRefresh);
  }, []);

  const fetchPostTypes = useCallback(async (forceRefresh: boolean = false) => {
    // ⚡ CACHE: Evita recarregar se já tiver dados em cache (a menos que forçado)
    if (hasFetchedPostTypes && postTypes.length > 0 && !forceRefresh) {
      return;
    }

    return deduplicar('postTypes', async () => {
    const fimPostTypes = perfPhase('catálogo:fetchPostTypes');
    try {
      setLoadingPostTypes(true);


      // Buscar TODOS os tipos de poste usando a função helper de paginação
      const data = await fetchAllRecords('post_types', '*', 'name', true);
      fimPostTypes({ linhas: data.length });



      // Mapear os dados do banco para o formato do frontend
      const postTypesFormatted: PostType[] = data.map(item => ({
        id: item.id,
        name: item.name || '',
        code: item.code || undefined,
        description: item.description || undefined,
        shape: item.shape || undefined,
        height_m: item.height_m || undefined,
        price: parseFloat(item.price) || 0,
        material_id: item.material_id || undefined,
      }));

      setPostTypes(postTypesFormatted);
      setHasFetchedPostTypes(true);
    } catch (error) {
      console.error('Erro ao buscar tipos de poste:', error);
      setPostTypes([]);
    } finally {
      setLoadingPostTypes(false);
    }
    });
  }, [hasFetchedPostTypes, postTypes.length]);

  const addPostToBudget = async (newPostData: { budget_id: string; post_type_id: string; name: string; x_coord: number; y_coord: number; skipPostTypeMaterial?: boolean; postTypeMaterialId?: string; postTypePrice?: number; pole_standard_id?: string; segment_id?: string | null; }) => {
    try {
      console.log(`🔄 === SUPABASE INSERT INICIADO ===`);
      console.log(`📤 Dados sendo enviados para Supabase:`, newPostData);

      // O chamador normalmente já tem o tipo de poste carregado em memória
      // (contexto postTypes), então evitamos uma consulta redundante ao banco
      // quando material_id/price já vêm prontos.
      const hasPostTypeDataFromCaller = newPostData.postTypeMaterialId !== undefined || newPostData.postTypePrice !== undefined;

      const [postTypeResult, { data: maxCounterData, error: maxCounterError }] = await Promise.all([
        hasPostTypeDataFromCaller
          ? Promise.resolve({ data: { material_id: newPostData.postTypeMaterialId, price: newPostData.postTypePrice ?? 0 }, error: null })
          : supabase
              .from('post_types')
              .select('material_id, price')
              .eq('id', newPostData.post_type_id)
              .single(),
        supabase
          .from('budget_posts')
          .select('counter')
          .eq('budget_id', newPostData.budget_id)
          .order('counter', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      const { data: postTypeData, error: postTypeError } = postTypeResult;

      if (postTypeError) {
        console.error('Erro ao buscar dados do tipo de poste:', postTypeError);
        throw postTypeError;
      }

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
          pole_standard_id: newPostData.pole_standard_id || null,
          // O segmento entra no próprio INSERT: o poste nasce marcado, sem uma
          // segunda escrita que poderia falhar e deixá-lo solto.
          segment_id: newPostData.segment_id ?? null,
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

        // O poste acabou de ser criado (data.id é novo), então não há como já
        // existir um post_materials para ele — inserir direto, sem checagem prévia.
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
      } else if (newPostData.skipPostTypeMaterial) {
        console.log(`ℹ️ skipPostTypeMaterial=true - não adicionando material do tipo de poste automaticamente`);
      } else {
        console.log(`⚠️ Post type não tem material_id - não será adicionado aos materiais avulsos`);
      }

      // Mapear o novo poste para o formato dos budgetDetails (incluindo material avulso se foi criado)
      const newPostDetail: BudgetPostDetail = {
        id: data.id,
        name: data.name || '',
        custom_name: data.custom_name || undefined,
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

  const addGroupToPost = async (groupId: string, postId: string, poleStandardId?: string) => {
    try {

      
      // a. Buscar os dados do template de grupo e c. os materiais do template
      // em paralelo, pois ambas as consultas dependem apenas do groupId
      const [
        { data: groupTemplate, error: groupError },
        { data: templateMaterials, error: materialsError },
      ] = await Promise.all([
        supabase
          .from('item_group_templates')
          .select('id, name, description')
          .eq('id', groupId)
          .single(),
        supabase
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
          .eq('template_id', groupId),
      ]);

      if (groupError) {
        console.error('Erro ao buscar template do grupo:', groupError);
        throw groupError;
      }

      if (materialsError) {
        console.error('Erro ao buscar materiais do template:', materialsError);
        throw materialsError;
      }

      // b. Criar novo registro na tabela post_item_groups
      const { data: newGroupInstance, error: instanceError } = await supabase
        .from('post_item_groups')
        .insert({
          budget_post_id: postId,
          template_id: groupId,
          name: groupTemplate.name,
          pole_standard_id: poleStandardId || null,
        })
        .select('id')
        .single();

      if (instanceError) {
        console.error('Erro ao criar instância do grupo:', instanceError);
        throw instanceError;
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
  const addLooseMaterialToPost = async (postId: string, materialId: string, quantity: number, price: number, poleStandardId?: string) => {
    try {
      const { data, error } = await supabase
        .from('post_materials')
        .insert({
          post_id: postId,
          material_id: materialId,
          quantity,
          price_at_addition: price,
          pole_standard_id: poleStandardId || null,
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

  // Função para atualizar preços consolidados (orçamento + catálogo base)
  const updateConsolidatedMaterialPrice = async (
    budgetId: string,
    materialId: string,
    newPrice: number
  ) => {
    const result = await syncMaterialPriceAction(budgetId, materialId, newPrice);

    if (!result.success) {
      throw new Error(result.error);
    }

    // Só o orçamento é recarregado. O catálogo de materiais não é mais tocado
    // por esta edição, então recarregar as ~2.500 linhas de `materials` seria
    // baixar de novo um dado que não mudou.
    // `true` força a recarga: uma busca já em voo traria o valor de antes da escrita.
    await fetchBudgetDetails(budgetId, true);
  };

  // Função para remover um material de todas as ocorrências do orçamento (grupos + avulsos)
  const removeMaterialFromBudget = async (budgetId: string, materialId: string) => {
    if (!budgetDetails || budgetDetails.id !== budgetId) {
      throw new Error('Orçamento não carregado.');
    }

    try {
      const groupIds = budgetDetails.posts.flatMap(post =>
        post.post_item_groups
          .filter(group =>
            group.post_item_group_materials.some(material => material.material_id === materialId)
          )
          .map(group => group.id)
      );
      const postIds = budgetDetails.posts.map(post => post.id);

      const [groupResult, looseResult] = await Promise.all([
        groupIds.length > 0
          ? supabase
              .from('post_item_group_materials')
              .delete()
              .eq('material_id', materialId)
              .in('post_item_group_id', groupIds)
          : Promise.resolve({ error: null }),
        postIds.length > 0
          ? supabase
              .from('post_materials')
              .delete()
              .eq('material_id', materialId)
              .in('post_id', postIds)
          : Promise.resolve({ error: null }),
      ]);

      if (groupResult.error) {
        console.error('Erro ao remover material dos grupos do orçamento:', groupResult.error);
        throw groupResult.error;
      }
      if (looseResult.error) {
        console.error('Erro ao remover material avulso do orçamento:', looseResult.error);
        throw looseResult.error;
      }

      setBudgetDetails(prev => {
        if (!prev) return prev;

        return {
          ...prev,
          posts: prev.posts.map(post => ({
            ...post,
            post_item_groups: post.post_item_groups.map(group => ({
              ...group,
              post_item_group_materials: group.post_item_group_materials.filter(
                material => material.material_id !== materialId
              ),
            })),
            post_materials: post.post_materials.filter(material => material.material_id !== materialId),
          })),
        };
      });
    } catch (error) {
      console.error('Erro ao remover material do orçamento:', error);
      throw error;
    }
  };

  // Funções para subgrupos de materiais
  const fetchMaterialSubgroups = useCallback(async () => {
    try {
      setLoadingMaterialSubgroups(true);

      const data = await fetchAllRecords('material_subgroups', '*', 'name', true);

      const formatted: MaterialSubgroupEntity[] = data.map(item => ({
        id: item.id,
        name: item.name || '',
        user_id: item.user_id,
      }));

      setMaterialSubgroups(formatted);
    } catch (error) {
      console.error('Erro ao buscar subgrupos de materiais:', error);
      setMaterialSubgroups([]);
    } finally {
      setLoadingMaterialSubgroups(false);
    }
  }, []);

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
    return deduplicar(`itemGroups:${companyId}`, async () => {
    const fimGrupos = perfPhase('catálogo:fetchItemGroups (templates + materiais)');
    try {
      setLoadingGroups(true);


      // Buscar templates de grupos para a empresa
      //
      // Sem o embed de `materials`: o mapeamento logo abaixo só lê
      // `material_id` e `quantity` (é tudo que `GrupoItem.materiais` tem), então
      // o objeto do material vinha pela rede e era descartado na hora. Como o
      // mesmo material se repete em dezenas de templates, era o mesmo padrão de
      // duplicação já corrigido em `fetchBudgetDetails`: na concessionária mais
      // pesada da base são 1.191 linhas de `template_materials` carregando um
      // objeto cada. Quem precisa do material resolve pelo catálogo de
      // `materiais`, que o `fetchMaterials` já mantém em memória.
      //
      // `count: 'exact'` também saiu: nada lê a contagem, e ela obriga o
      // Postgres a um COUNT completo além da página.
      const { data: templatesData, error: templatesError } = await supabase
        .from('item_group_templates')
        .select(`
          id,
          name,
          description,
          company_id,
          template_materials (
            material_id,
            quantity
          )
        `)
        .eq('company_id', companyId)
        .range(0, 200); // Limite de 200 grupos por concessionária (otimizado)
      fimGrupos({ KB: perfJsonKb(templatesData), templates: templatesData?.length ?? 0 });

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
    });
  }, []);

  // Busca grupos de itens de várias concessionárias de uma vez. Usado pelo
  // editor de padrão de poste: como um padrão pode ser compartilhado por
  // várias concessionárias e cada uma tem seu próprio catálogo de grupos,
  // o editor precisa enxergar a união dos catálogos das concessionárias
  // selecionadas (senão grupos de uma concessionária "somem" ao editar
  // um padrão também usado por outra).
  const fetchItemGroupsByCompanies = useCallback(async (companyIds: string[]) => {
    if (companyIds.length === 0) {
      setItemGroups([]);
      return;
    }

    try {
      setLoadingGroups(true);

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
        .in('company_id', companyIds)
        .range(0, 200);

      if (templatesError) {
        console.error('Erro ao buscar templates de grupos:', templatesError);
        throw templatesError;
      }

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

  // Funções para padrões de poste (grupo de grupos de itens).
  // Um padrão é uma única linha compartilhada por N concessionárias através
  // de pole_standard_companies — não existe mais "o padrão da concessionária
  // X", apenas "padrões que a concessionária X usa".
  const fetchPoleStandards = useCallback(async (companyId: string) => {
    try {
      setLoadingPoleStandards(true);

      const { data: linksData, error: linksError } = await supabase
        .from('pole_standard_companies')
        .select('pole_standard_id')
        .eq('company_id', companyId);

      if (linksError) {
        console.error('Erro ao buscar vínculos de padrões de poste:', linksError);
        throw linksError;
      }

      const standardIds = (linksData || []).map(l => l.pole_standard_id);

      if (standardIds.length === 0) {
        setPoleStandards([]);
        return;
      }

      const { data: standardsData, error: standardsError } = await supabase
        .from('pole_standards')
        .select(`
          id,
          name,
          description,
          post_type_id,
          pole_standard_companies (
            company_id
          ),
          pole_standard_groups (
            template_id,
            quantity
          ),
          pole_standard_materials (
            material_id,
            quantity
          )
        `)
        .in('id', standardIds)
        .order('name', { ascending: true })
        .range(0, 200);

      if (standardsError) {
        console.error('Erro ao buscar padrões de poste:', standardsError);
        throw standardsError;
      }

      const padroesFormatados: PoleStandard[] = standardsData?.map(standard => ({
        id: standard.id,
        nome: standard.name || '',
        descricao: standard.description || '',
        concessionariaIds: standard.pole_standard_companies?.map(c => c.company_id) || [],
        postTypeId: standard.post_type_id,
        grupos: standard.pole_standard_groups?.map(g => ({
          templateId: g.template_id,
          quantidade: g.quantity,
        })) || [],
        materiais: standard.pole_standard_materials?.map(m => ({
          materialId: m.material_id,
          quantidade: m.quantity,
        })) || []
      })) || [];

      setPoleStandards(padroesFormatados);
    } catch (error) {
      console.error('Erro ao buscar padrões de poste:', error);
      setPoleStandards([]);
    } finally {
      setLoadingPoleStandards(false);
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
    const fimCore = perfPhase('global:fetchAllCoreData (orçamentos + concessionárias + pastas)');
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
      fimCore();
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

      // Estados para subgrupos de materiais
      materialSubgroups,
      loadingMaterialSubgroups,

      // Estados para padrões de poste (grupo de grupos de itens)
      poleStandards,
      loadingPoleStandards,
      currentPoleStandard,

      // Estados para sistema de pastas
      folders,
      loadingFolders,
      currentFolderId,
      
      setCurrentView,
      setCurrentOrcamento,
      setCurrentGroup,
      setCurrentPoleStandard,

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
      removeMaterialFromBudget,

      // Funções para subgrupos de materiais
      fetchMaterialSubgroups,

      // Funções para concessionárias e grupos
      fetchUtilityCompanies,
      fetchItemGroups,
      fetchItemGroupsByCompanies,

      // Funções para padrões de poste
      fetchPoleStandards,

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