'use client';

import { useState, useTransition } from 'react';
import { Loader2, Trash2, Eye } from 'lucide-react';
import { cleanupOrphanStorage } from '@/actions/cleanupOrphanStorage';

interface CleanupResult {
  scanned: number;
  removed: number;
  errors: string[];
  dryRun: boolean;
}

export function AdminPanel() {
  const [result, setResult] = useState<CleanupResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function runCleanup(dryRun: boolean) {
    setError(null);
    startTransition(async () => {
      const res = await cleanupOrphanStorage(dryRun);
      if (res.success && res.data) {
        setResult(res.data);
      } else {
        setError(res.success ? 'Resultado inesperado.' : res.error ?? 'Erro desconhecido.');
      }
    });
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6">
      <h2 className="text-sm font-semibold text-[#1D3140]">
        Limpeza de uploads órfãos
      </h2>
      <p className="mt-1 text-xs text-gray-500">
        Remove arquivos no Storage que não têm registro associado no banco de dados
        e têm mais de 24 horas. Execute primeiro em modo preview para verificar.
      </p>

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => runCleanup(true)}
          disabled={isPending}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-xs font-medium text-[#1D3140] shadow-sm transition-colors hover:bg-gray-50 disabled:opacity-60"
        >
          {isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Eye className="h-3.5 w-3.5" />
          )}
          Preview (dry-run)
        </button>
        <button
          type="button"
          onClick={() => runCleanup(false)}
          disabled={isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-xs font-medium text-white shadow-sm transition-colors hover:bg-red-700 disabled:opacity-60"
        >
          {isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}
          Executar limpeza
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-4 space-y-2">
          <div className="rounded-md border border-gray-200 bg-gray-50 px-4 py-3">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs sm:grid-cols-4">
              <div>
                <dt className="text-gray-500">Modo</dt>
                <dd className="font-semibold text-[#1D3140]">
                  {result.dryRun ? 'Preview' : 'Execução real'}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Escaneados</dt>
                <dd className="font-semibold text-[#1D3140]">{result.scanned}</dd>
              </div>
              <div>
                <dt className="text-gray-500">
                  {result.dryRun ? 'A remover' : 'Removidos'}
                </dt>
                <dd className="font-semibold text-[#1D3140]">{result.removed}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Erros</dt>
                <dd className="font-semibold text-[#1D3140]">{result.errors.length}</dd>
              </div>
            </dl>
          </div>

          {result.errors.length > 0 && (
            <details className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <summary className="cursor-pointer font-semibold">
                {result.errors.length} {result.errors.length === 1 ? 'erro' : 'erros'}
              </summary>
              <ul className="mt-2 list-disc space-y-1 pl-4">
                {result.errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </section>
  );
}
