'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { completeQuotationSessionAction } from '@/actions/quotationSessions';

export default function CompleteSessionButton({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  return (
    <button
      type="button"
      disabled={pending}
      onClick={async () => {
        if (!confirm('Encerrar esta sessão? Novos uploads serão bloqueados.')) return;
        setPending(true);
        const res = await completeQuotationSessionAction(sessionId);
        setPending(false);
        if (res.success) {
          router.refresh();
        } else {
          alert(res.error);
        }
      }}
      className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
    >
      {pending && <Loader2 className="h-4 w-4 animate-spin" />}
      Encerrar sessão
    </button>
  );
}
