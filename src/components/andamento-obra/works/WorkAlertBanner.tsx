import Link from 'next/link';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import type { WorkOpenAlert } from '@/services/works/getWorkOpenAlert';
import { ALERT_SEVERITY_LABELS } from '@/types/works';
import { formatRelativeTime } from '@/lib/formatRelativeTime';

interface Props {
  workId: string;
  alert: WorkOpenAlert | null;
}

/**
 * Impedimento no topo da obra, acima de tudo.
 *
 * Antes isso era a aba Alertas. Aba e lugar aonde alguem precisa IR, e quando a
 * obra parou o engenheiro nao vai la: ele descobre pelo telefone tocando. A
 * faixa inverte isso — ela aparece sozinha e some sozinha quando o ultimo
 * impedimento e encerrado.
 *
 * `resolved_in_field` continua aparecendo, com outro texto: o gerente ja
 * resolveu e esta esperando o engenheiro confirmar. Some da frente cedo demais
 * e o encerramento nunca acontece.
 */
export function WorkAlertBanner({ workId, alert }: Props) {
  if (!alert) return null;

  const resolvido = alert.status === 'resolved_in_field';
  const outros = alert.totalOpen - 1;

  return (
    <div
      role="status"
      className={`border-b ${
        resolvido ? 'border-amber-200 bg-amber-50' : 'border-red-200 bg-red-50'
      }`}
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-1 px-6 py-2.5 lg:px-8">
        <AlertTriangle
          aria-hidden
          className={`h-4 w-4 shrink-0 ${resolvido ? 'text-amber-700' : 'text-red-700'}`}
        />
        <span className={`text-sm font-semibold ${resolvido ? 'text-amber-900' : 'text-red-900'}`}>
          {resolvido ? 'Resolvido em campo, aguardando você' : 'Obra parada'}
        </span>
        <span className={`text-sm ${resolvido ? 'text-amber-800' : 'text-red-800'}`}>
          {alert.title}
        </span>
        <span className={`text-xs ${resolvido ? 'text-amber-700' : 'text-red-700'}`}>
          {ALERT_SEVERITY_LABELS[alert.severity]} &middot; aberto {formatRelativeTime(alert.createdAt)}
          {outros > 0 ? ` · mais ${outros} em aberto` : ''}
        </span>
        <Link
          href={`/tools/andamento-obra/obras/${workId}/alertas`}
          className={`ml-auto inline-flex items-center gap-1 rounded-md border bg-surface px-2.5 py-1 text-xs font-semibold transition-colors ${
            resolvido
              ? 'border-amber-200 text-amber-800 hover:bg-amber-100'
              : 'border-red-200 text-red-800 hover:bg-red-100'
          }`}
        >
          Abrir
          <ArrowRight aria-hidden className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}
