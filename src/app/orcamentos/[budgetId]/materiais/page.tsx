import type { Metadata } from 'next';
import { MateriaisStep } from '@/components/orcamentos/MateriaisStep';

export const metadata: Metadata = {
  title: 'Materiais — OrcaRede',
  description: 'Consolidado de materiais do orçamento, por material e por subgrupo.',
};

/** Etapa 2 da esteira: o consolidado de materiais. */
export default function MateriaisPage() {
  return <MateriaisStep />;
}
