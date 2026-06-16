import { listAllSuppliersAction } from '@/actions/suppliers';
import SuppliesHeader from '@/components/suppliers/SuppliesHeader';
import SupplierListView from '@/components/suppliers/SupplierListView';

export const metadata = {
  title: 'Fornecedores — OrcaRede',
};

export default async function FornecedoresCadastroPage() {
  const result = await listAllSuppliersAction();
  const suppliers = result.success ? result.data : [];

  return (
    <main className="flex min-h-screen flex-col bg-slate-100 p-6 lg:p-8">
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8">
        <SuppliesHeader
          activeStep="fornecedores"
          title="Cadastro de Fornecedores"
          description="Gerencie fornecedores usados ao importar PDFs de cotação. Cadastre antes de iniciar uma sessão de cotações."
        />
        {!result.success && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {result.error}
          </p>
        )}
        <div className="flex min-h-0 flex-1 flex-col">
          <SupplierListView initialSuppliers={suppliers} />
        </div>
      </div>
    </main>
  );
}
