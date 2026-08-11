import {
  Boxes,
  Building,
  Building2,
  FileText,
  Images,
  Layers,
  Package,
  Split,
  TowerControl,
  UserCheck,
  UserCog,
  Users,
  Workflow,
} from "lucide-react";
import type { ComponentType } from "react";

/**
 * Registro único das seções de Configurações (Escopo §6.1).
 *
 * Alimenta a grade do hub e os breadcrumbs das subtelas — as duas superfícies
 * deixam de manter listas paralelas, no mesmo espírito de `layout/modules.tsx`.
 * Seções `soon` aparecem desabilitadas até ganharem tela própria.
 */
export interface ConfigSection {
  id: string;
  label: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  /** Caminho da tela. `null` enquanto a seção não tem rota. */
  href: string | null;
  status: "active" | "soon";
  /** Agrupamento na grade do hub. */
  group: "catalogos" | "identidade" | "sistema";
}

export const CONFIG_SECTIONS: ConfigSection[] = [
  {
    id: "materiais",
    label: "Materiais",
    description: "Catálogo completo de materiais, com preço, unidade e subgrupo",
    icon: Package,
    href: "/configuracoes/materiais",
    status: "active",
    group: "catalogos",
  },
  {
    id: "subgrupos",
    label: "Subgrupos de materiais",
    description: "Classificação usada para filtrar materiais e consolidar o orçamento",
    icon: Boxes,
    href: "/configuracoes/subgrupos",
    status: "active",
    group: "catalogos",
  },
  {
    id: "concessionarias",
    label: "Concessionárias",
    description: "Distribuidoras de energia que definem os catálogos de grupos e padrões",
    icon: Building2,
    href: "/configuracoes/concessionarias",
    status: "active",
    group: "catalogos",
  },
  {
    id: "grupos",
    label: "Grupos de itens",
    description: "Kits de materiais reutilizáveis, organizados por concessionária",
    icon: Layers,
    href: "/configuracoes/grupos",
    status: "active",
    group: "catalogos",
  },
  {
    id: "tipos-postes",
    label: "Tipos de poste",
    description: "Catálogo de tipos de poste usados na área de trabalho do orçamento",
    icon: TowerControl,
    href: "/configuracoes/tipos-postes",
    status: "active",
    group: "catalogos",
  },
  {
    id: "padroes-poste",
    label: "Padrões de poste",
    description: "Combinação de tipo de poste, grupos de itens e materiais avulsos",
    icon: Workflow,
    href: "/configuracoes/padroes-poste",
    status: "active",
    group: "catalogos",
  },
  {
    id: "empresa",
    label: "Empresa",
    description: "Dados institucionais, logo e WhatsApp que aparecem na proposta",
    icon: Building,
    href: "/configuracoes/empresa",
    status: "active",
    group: "identidade",
  },
  {
    id: "responsaveis",
    label: "Responsáveis técnicos",
    description: "Nome, CREA e assinatura usados no termo de aceite da proposta",
    icon: UserCheck,
    href: "/configuracoes/responsaveis",
    status: "active",
    group: "identidade",
  },
  {
    id: "segmentos",
    label: "Segmentos de obra",
    description: "Catálogo de segmentos (rede, iluminação, ramais…) marcados no orçamento",
    icon: Split,
    href: null,
    status: "soon",
    group: "sistema",
  },
  {
    id: "templates-proposta",
    label: "Templates de proposta",
    description: "Texto institucional e estrutura de seções padrão das propostas",
    icon: FileText,
    href: "/configuracoes/templates-proposta",
    status: "active",
    group: "identidade",
  },
  {
    id: "midia",
    label: "Biblioteca de mídia",
    description: "Fotos com tags, reutilizáveis em qualquer proposta",
    icon: Images,
    href: "/configuracoes/midia",
    status: "active",
    group: "identidade",
  },
  {
    id: "organizacao",
    label: "Organização e equipe",
    description: "Organização ativa, setor de cada pessoa e acesso por módulo",
    icon: Users,
    href: "/configuracoes/organizacao",
    status: "active",
    group: "sistema",
  },
  {
    id: "perfil",
    label: "Perfil",
    description: "Dados da sua conta",
    icon: UserCog,
    href: null,
    status: "soon",
    group: "sistema",
  },
];

export const CONFIG_GROUP_LABELS: Record<ConfigSection["group"], string> = {
  catalogos: "Catálogos do orçamento",
  identidade: "Identidade e proposta",
  sistema: "Sistema",
};

export const CONFIG_GROUP_ORDER: ConfigSection["group"][] = [
  "catalogos",
  "identidade",
  "sistema",
];

export function getConfigSection(id: string): ConfigSection | undefined {
  return CONFIG_SECTIONS.find((section) => section.id === id);
}
