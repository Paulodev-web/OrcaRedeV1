'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  User,
  MessageCircle,
  AlertTriangle,
  Radio,
  CheckCircle2,
  MoreVertical,
  Pencil,
  Trash2,
} from 'lucide-react';
import { formatRelativeTime } from '@/lib/formatRelativeTime';
import { deleteWork } from '@/actions/works';
import {
  STATUS_LABELS,
  type WorkStatus,
  type WorkWithManager,
} from '@/types/works';
import type { ManagerRow } from '@/types/people';
import { ImportedBudgetBadge } from './ImportedBudgetBadge';
import { NewWorkDialog } from './NewWorkDialog';

interface WorkCardProps {
  work: WorkWithManager;
  managers: ManagerRow[];
  unreadCount?: number;
  /** Impedimentos `critical` ou `high` ainda em aberto. */
  impedimentosGraves?: number;
  /** Todos os impedimentos não encerrados, inclusive os resolvidos em campo. */
  impedimentosAtivos?: number;
  /** Resolvidos em campo, esperando o engenheiro confirmar o encerramento. */
  impedimentosResolvidos?: number;
  /** Último registro de execução, pelo relógio do aparelho. Null: nada ainda. */
  lastRecordAt?: string | null;
}

const STATUS_BADGE: Record<WorkStatus, string> = {
  planned: 'bg-blue-50 text-blue-700 ring-blue-200',
  in_progress: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  paused: 'bg-amber-50 text-amber-700 ring-amber-200',
  completed: 'bg-gray-100 text-gray-600 ring-gray-200',
  cancelled: 'bg-red-50 text-red-700 ring-red-200',
};

/**
 * Depois de quantos dias sem registro a obra passa a ser sinalizada.
 *
 * Dois: um dia sem registro e chuva, feriado ou material atrasado. Tres ja e
 * alguma coisa que o engenheiro deveria ter perguntado ontem.
 */
const DIAS_ATE_SILENCIO = 2;

function diasDesde(iso: string): number {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.floor((Date.now() - t) / (1000 * 60 * 60 * 24));
}

export function WorkCard({
  work,
  managers,
  unreadCount = 0,
  impedimentosGraves = 0,
  impedimentosAtivos = 0,
  impedimentosResolvidos = 0,
  lastRecordAt = null,
}: WorkCardProps) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleting, startDeleteTransition] = useTransition();

  const emExecucao = work.status === 'in_progress';
  const diasEmSilencio = lastRecordAt ? diasDesde(lastRecordAt) : null;
  const calada =
    emExecucao &&
    diasEmSilencio !== null &&
    diasEmSilencio >= DIAS_ATE_SILENCIO;
  const nuncaRegistrou = emExecucao && lastRecordAt === null;
  const apenasResolvidos =
    impedimentosAtivos > 0 && impedimentosAtivos === impedimentosResolvidos;

  function handleDelete() {
    setMenuOpen(false);
    const confirmed = confirm(
      `Excluir a obra "${work.name}"? Marcos, alertas, checklists, mensagens e fotos dela serão apagados junto. Essa ação não pode ser desfeita.`,
    );
    if (!confirmed) return;

    startDeleteTransition(async () => {
      const result = await deleteWork(work.id);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success('Obra excluída.');
      router.refresh();
    });
  }

  return (
    <>
      <Link
        href={`/tools/andamento-obra/obras/${work.id}`}
        className="relative block rounded-xl border border-gray-200 bg-surface p-4 shadow-sm transition-all hover:border-accent-500/50 hover:shadow-md"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold text-neutral-900">
              {work.name}
            </h3>
            {work.clientName && (
              <p className="mt-0.5 truncate text-xs text-gray-500">
                {work.clientName}
              </p>
            )}
          </div>
          <div className="flex flex-shrink-0 items-center gap-1.5">
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ring-1 ${STATUS_BADGE[work.status]}`}
            >
              {STATUS_LABELS[work.status]}
            </span>

            <div className="relative">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setMenuOpen((prev) => !prev);
                }}
                title="Mais opções"
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <MoreVertical className="h-4 w-4" />
              </button>

              {menuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-20"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setMenuOpen(false);
                    }}
                  />
                  <div
                    onClick={(e) => e.preventDefault()}
                    className="absolute right-0 top-8 z-30 w-44 overflow-hidden rounded-xl border border-gray-100 bg-surface py-1.5 shadow-xl ring-1 ring-black/5 duration-100 animate-in fade-in-0 zoom-in-95"
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setMenuOpen(false);
                        setEditOpen(true);
                      }}
                      className="mx-1 flex w-[calc(100%-8px)] items-center space-x-2.5 rounded-lg px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                    >
                      <Pencil className="h-4 w-4 text-gray-400" />
                      <span>Editar obra</span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleDelete();
                      }}
                      disabled={deleting}
                      className="mx-1 flex w-[calc(100%-8px)] items-center space-x-2.5 rounded-lg px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" />
                      <span>{deleting ? 'Excluindo...' : 'Excluir obra'}</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="mt-3 space-y-1.5 text-xs text-gray-600">
          <div className="flex items-center gap-1.5">
            <User className="h-3.5 w-3.5 text-gray-400" />
            <span className="truncate">
              {work.managerName ?? 'Sem gerente atribuído'}
            </span>
          </div>

          {/* O que o CAMPO fez, não quando a linha da obra foi tocada pela última
            vez: conversa mexe em `last_activity_at` e não é execução. */}
          <div
            className={`flex items-center gap-1.5 ${
              calada || nuncaRegistrou
                ? 'font-medium text-amber-700'
                : 'text-gray-600'
            }`}
          >
            <Radio
              className={`h-3.5 w-3.5 ${calada || nuncaRegistrou ? '' : 'text-gray-400'}`}
            />
            <span>
              {nuncaRegistrou
                ? 'Nenhum registro ainda'
                : lastRecordAt
                  ? `Último registro ${formatRelativeTime(lastRecordAt)}`
                  : 'Sem registros de campo'}
            </span>
          </div>

          {unreadCount > 0 && (
            <div className="flex items-center gap-1.5 text-blue-700">
              <MessageCircle className="h-3.5 w-3.5" />
              <span className="font-medium">
                {unreadCount === 1
                  ? '1 mensagem não lida'
                  : `${unreadCount > 99 ? '99+' : unreadCount} mensagens não lidas`}
              </span>
            </div>
          )}

          {impedimentosGraves > 0 && (
            <div className="flex items-center gap-1.5 text-red-700">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span className="font-medium">
                {impedimentosGraves === 1
                  ? 'Obra parada'
                  : `${impedimentosGraves} impedimentos graves`}
              </span>
            </div>
          )}

          {impedimentosGraves === 0 &&
            impedimentosAtivos > 0 &&
            !apenasResolvidos && (
              <div className="flex items-center gap-1.5 text-orange-600">
                <AlertTriangle className="h-3.5 w-3.5" />
                <span className="font-medium">
                  {impedimentosAtivos} impedimento
                  {impedimentosAtivos > 1 ? 's' : ''} em aberto
                </span>
              </div>
            )}

          {apenasResolvidos && (
            <div className="flex items-center gap-1.5 text-amber-600">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span className="font-medium">
                Resolvido em campo, falta você encerrar
              </span>
            </div>
          )}

          {work.budgetId && (
            <div className="pt-0.5">
              <ImportedBudgetBadge />
            </div>
          )}
        </div>

        {unreadCount > 0 && (
          <span
            aria-hidden
            className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent-600 px-1 text-[10px] font-bold text-white shadow-md"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </Link>

      <NewWorkDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        managers={managers}
        work={work}
      />
    </>
  );
}
