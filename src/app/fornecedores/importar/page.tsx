import { redirect } from 'next/navigation';

export default function FornecedoresImportarRedirectPage() {
  redirect('/fornecedores?tab=importar');
}
