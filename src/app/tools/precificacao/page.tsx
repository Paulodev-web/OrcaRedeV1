import type { Metadata } from 'next';
import { PrecificacaoCalculator } from '@/components/precificacao/PrecificacaoCalculator';

export const metadata: Metadata = {
  title: 'Módulo de Precificação — OrcaRede',
  description: 'Calculadora de Margem de Contribuição com receita, custos variáveis e imposto sobre MC.',
};

export default function PrecificacaoPage() {
  return (
    <main className="min-h-screen bg-gray-50 p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <PrecificacaoCalculator />
      </div>
    </main>
  );
}
