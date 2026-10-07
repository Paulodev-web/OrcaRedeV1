'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';

export default function WorkError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <section role="alert" className="rounded-xl border border-amber-200 bg-surface p-6">
    <h2 className="font-semibold text-neutral-900">Não foi possível atualizar esta tela</h2>
    <p className="mt-2 text-sm text-gray-600">A conexão pode ter sido interrompida. Se você acabou de salvar, recarregue e confira o resultado antes de repetir a operação.</p>
    <button type="button" disabled={pending} className="mt-4 min-h-11 rounded border px-4 text-sm" onClick={() => startTransition(() => { router.refresh(); reset(); })}>
      {pending ? 'Recarregando…' : 'Tentar novamente'}
    </button>
  </section>;
}
