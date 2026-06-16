import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Dashboard de Precificação — OrcaRede',
  description: 'Cards de orçamentos precificados salvos no módulo de precificação.',
};

export default function PricingDashboardPage() {
  redirect('/tools/precificacao');
}
