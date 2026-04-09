export interface Material {
  id: string;
  codigo: string;
  descricao: string;
  precoUnit: number;
  unidade: string;
  user_id?: string;
}

export interface GrupoItem {
  id: string;
  nome: string;
  descricao: string;
  concessionariaId: string;
  materiais: {
    materialId: string;
    quantidade: number;
  }[];
}

export interface Concessionaria {
  id: string;
  nome: string;
  sigla: string;
  user_id?: string;
}

export type TipoPoste = '600mm' | '1000mm' | '1500mm' | '2000mm';
export type TipoFixacao = 'Direto' | 'Cruzeta' | 'Suporte' | 'Outro';

export interface Poste {
  id: string;
  nome: string;
  customName?: string;
  counter?: number;
  tipo: TipoPoste;
  tipoFixacao?: TipoFixacao;
  x: number;
  y: number;
  gruposItens: string[];
  concluido: boolean;
}

export interface Orcamento {
  id: string;
  nome: string;
  concessionariaId: string;
  company_id?: string;
  dataModificacao: string;
  status: 'Em Andamento' | 'Finalizado';
  imagemPlanta?: string;
  postes: Poste[];
  clientName?: string;
  city?: string;
  folderId?: string | null;
  render_version?: number;
}

export interface BudgetFolder {
  id: string;
  name: string;
  color?: string;
  userId: string;
  parentId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MaterialConsolidado {
  material: Material;
  quantidade: number;
  precoTotal: number;
}

export interface PostType {
  id: string;
  name: string;
  code?: string;
  description?: string;
  shape?: string;
  height_m?: number;
  price: number;
  user_id?: string;
}

export interface BudgetPostDetail {
  id: string;
  name: string;
  custom_name?: string;
  counter: number;
  x_coord: number;
  y_coord: number;
  post_types: {
    id: string;
    name: string;
    code?: string;
    description?: string;
    shape?: string;
    height_m?: number;
    price: number;
  } | null;
  post_item_groups: PostItemGroupDetail[];
  post_materials: PostMaterial[];
}

export interface PostItemGroupDetail {
  id: string;
  name: string;
  template_id?: string;
  post_item_group_materials: PostItemGroupMaterial[];
}

export interface PostItemGroupMaterial {
  material_id: string;
  quantity: number;
  price_at_addition: number;
  materials: {
    id: string;
    code: string;
    name: string;
    description?: string;
    unit: string;
    price: number;
  };
}

export interface PostMaterial {
  id: string;
  post_id: string;
  material_id: string;
  quantity: number;
  price_at_addition: number;
  materials: {
    id: string;
    code: string;
    name: string;
    description?: string;
    unit: string;
    price: number;
  };
}

export interface BudgetDetails {
  id: string;
  name: string;
  company_id?: string;
  client_name?: string;
  city?: string;
  status?: 'Em Andamento' | 'Finalizado';
  created_at?: string;
  updated_at?: string;
  plan_image_url?: string;
  posts: BudgetPostDetail[];
  render_version?: number;
}

export interface WorkTracking {
  id: string;
  budget_id: string;
  name: string;
  status: 'Planejado' | 'Em Andamento' | 'Pausado' | 'Concluído';
  network_extension_km?: number;
  planned_network_meters?: number;
  planned_mt_meters?: number;
  mt_extension_km?: number;
  planned_bt_meters?: number;
  bt_extension_km?: number;
  planned_poles?: number;
  poles_installed?: number;
  planned_equipment?: number;
  equipment_installed?: number;
  planned_public_lighting?: number;
  public_lighting_installed?: number;
  start_date?: string;
  estimated_completion?: string;
  actual_completion?: string;
  progress_percentage: number;
  render_version?: 1 | 2;
  current_focus_title?: string;
  current_focus_description?: string;
  project_description?: string;
  responsible_person?: string;
  work_images?: Array<{ id: string; name: string; url: string; uploadDate: string; description?: string }>;
  created_at: string;
  updated_at: string;
  budget_data: {
    project_name: string;
    client_name?: string;
    city?: string;
    plan_image_url?: string;
    client_logo_url?: string;
  };
  tracked_posts: TrackedPost[];
  post_connections: PostConnection[];
}

export interface PostConnection {
  id: string;
  from_post_id: string;
  to_post_id: string;
  connection_type?: 'blue' | 'green';
}

export interface TrackedPost {
  id: string;
  tracking_id: string;
  original_post_id: string;
  name: string;
  custom_name?: string;
  x_coord: number;
  y_coord: number;
  status: 'Pendente' | 'Em Andamento' | 'Concluído' | 'Problemas';
  installation_date?: string;
  completion_date?: string;
  notes?: string;
  updated_at?: string;
  photos: TrackedPostPhoto[];
  materials: TrackedPostMaterial[];
}

export interface TrackedPostPhoto {
  id: string;
  tracked_post_id: string;
  url: string;
  description?: string;
  uploaded_at: string;
}

export interface TrackedPostMaterial {
  id: string;
  tracked_post_id: string;
  material_id: string;
  planned_quantity: number;
  used_quantity: number;
  status: 'Pendente' | 'Parcial' | 'Completo';
  material_data: {
    code: string;
    name: string;
    unit: string;
  };
}

// =============================================================================
// Módulo: Comparação de Fornecedores e Cenários de Compra
// =============================================================================

export type SupplierQuoteStatus = 'pendente' | 'conciliado' | 'aprovado';
export type SupplierMatchStatus = 'sem_match' | 'automatico' | 'manual';
export type SupplierMatchMethod = 'exact_memory' | 'semantic_ai' | 'manual';
export type SupplierMappingSource = 'manual' | 'ai';
export type SemanticSuggestionStatus = 'suggested' | 'accepted' | 'rejected';

export interface SupplierQuote {
  id: string;
  /** Null em cotações de sessão global (conciliação com catálogo). */
  budget_id: string | null;
  session_id?: string | null;
  supplier_name: string;
  pdf_path: string;
  status: SupplierQuoteStatus;
  observacoes_gerais?: string;
  user_id: string;
  created_at: string;
  updated_at: string;
}

export interface SupplierQuoteItem {
  id: string;
  quote_id: string;
  descricao: string;
  unidade: string;
  quantidade: number;
  preco_unit: number;
  total_item: number;
  ipi_percent: number;
  st_incluso: boolean;
  alerta: boolean;
  matched_material_id?: string | null;
  conversion_factor: number;
  match_status: SupplierMatchStatus;
  match_level?: number | null;
  match_confidence?: number | null;
  match_method?: SupplierMatchMethod | null;
  created_at: string;
}

export interface SupplierMaterialMapping {
  id: string;
  user_id: string;
  supplier_name: string;
  supplier_material_name: string;
  internal_material_id: string;
  conversion_factor: number;
  last_seen_at?: string;
  times_used: number;
  source: SupplierMappingSource;
  confidence_snapshot?: number | null;
  created_at: string;
  updated_at: string;
}

export interface SemanticMatchSuggestion {
  id: string;
  supplier_quote_item_id: string;
  suggested_material_id: string;
  suggested_conversion_factor: number;
  confidence_score: number;
  rationale?: string | null;
  status: SemanticSuggestionStatus;
  model: string;
  created_at: string;
  reviewed_at?: string | null;
}

export interface BudgetOption {
  id: string;
  name: string;
}
