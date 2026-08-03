import type { Metadata } from 'next';
import { AreaTrabalho } from '@/components/AreaTrabalho';

export const metadata: Metadata = {
  title: 'Projeto — OrcaRede',
  description: 'Canvas, postes, grupos de itens e marcação de segmento do orçamento.',
};

/** Etapa 1 da esteira: o projeto no canvas. */
export default function ProjetoPage() {
  return <AreaTrabalho embedded view="main" />;
}
