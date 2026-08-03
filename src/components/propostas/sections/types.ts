import type { ProposalRecord } from '@/services/proposals/repository';

/** Cenário de precificação disponível para virar opção de preço da proposta. */
export interface ScenarioChoice {
  id: string;
  scenarioName: string;
  isPrimary: boolean;
  materialTotal: number;
  laborTotal: number;
  grandTotal: number;
}

export interface ResponsibleChoice {
  id: string;
  fullName: string;
  crea: string;
}

/** Segmento de obra do orçamento, para rotular linhas de valor por segmento. */
export interface SegmentChoice {
  segmentId: string | null;
  label: string;
}

/** Tudo que um painel de seção precisa. Vem inteiro do server component. */
export interface EditorContext {
  record: ProposalRecord;
  responsibles: ResponsibleChoice[];
  scenarios: ScenarioChoice[];
  segments: SegmentChoice[];
  /** Proposta publicada: edição travada. */
  locked: boolean;
}

export interface PanelProps {
  context: EditorContext;
  origin?: string;
}
