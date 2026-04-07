import { redirect } from 'next/navigation';

export default function FornecedoresImportarRedirectPage() {
  redirect('/fornecedores/trabalho?tab=importar');
}
