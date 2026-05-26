import type { Metadata } from 'next';
import { PrecificacaoCalculator } from '@/components/precificacao/PrecificacaoCalculator';

export const metadata: Metadata = {
  title: 'Nova Precificação — OrcaRede',
  description: 'Crie uma precificação vinculada a um orçamento e salve no dashboard.',
};

export default function NovaPrecificacaoPage() {
  return (
    <main className="min-h-screen bg-gray-50 p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <PrecificacaoCalculator />
      </div>
    </main>
  );
}
