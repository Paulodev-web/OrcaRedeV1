import Link from 'next/link';
import { MapPin, Wrench, Clock } from 'lucide-react';
import type { WorkDay, DayEntry, DayEntryKind } from '@/services/works/getWorkDays';
import { PrintDayButton } from './PrintDayButton';

interface Props {
  workId: string;
  dias: WorkDay[];
  selecionado: WorkDay | null;
  signedUrls: Record<string, string>;
}

const ICONE: Record<DayEntryKind, typeof MapPin> = {
  pole: MapPin,
  equipment: Wrench,
};

const COR: Record<DayEntryKind, string> = {
  pole: 'bg-emerald-500',
  equipment: 'bg-emerald-600',
};

/** 'YYYY-MM-DD' vira meio-dia local: às 00:00 UTC o dia vira o anterior aqui. */
function comoData(date: string): Date {
  return new Date(`${date}T12:00:00`);
}

function diaLongo(date: string): string {
  const texto = comoData(date).toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function diaCurto(date: string): string {
  const texto = comoData(date).toLocaleDateString('pt-BR', {
    weekday: 'short',
    day: '2-digit',
  });
  return texto.charAt(0).toUpperCase() + texto.slice(1).replace('.', '');
}

function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  });
}

/** Passou pela fila se a chegada ficou mais de 5 min depois do registro. */
function atrasou(entry: DayEntry): boolean {
  const feito = new Date(entry.at).getTime();
  const chegou = new Date(entry.arrivedAt).getTime();
  if (!Number.isFinite(feito) || !Number.isFinite(chegou)) return false;
  return chegou - feito > 5 * 60 * 1000;
}

function resumoCurto(dia: WorkDay): string {
  const partes = [
    dia.poles > 0 ? `${dia.poles} poste${dia.poles > 1 ? 's' : ''}` : null,
    dia.structures > 0 ? `${dia.structures} equipamento${dia.structures > 1 ? 's' : ''}` : null,
  ].filter(Boolean);
  return partes.length > 0 ? partes.join(' · ') : 'Sem registros';
}

export function DiaADiaView({ workId, dias, selecionado, signedUrls }: Props) {
  if (!selecionado) {
    return (
      <div className="rounded-xl border border-gray-200 bg-surface p-8 text-center">
        <p className="text-sm font-medium text-neutral-900">Nenhum registro ainda</p>
        <p className="mt-1 text-xs text-gray-500">
          Assim que o gerente levantar um poste ou montar um equipamento, o dia aparece aqui
          sozinho. Não há nada para preencher.
        </p>
      </div>
    );
  }

  const numeros = [
    { valor: String(selecionado.poles), rotulo: 'postes levantados' },
    { valor: String(selecionado.structures), rotulo: 'equipamentos montados' },
    { valor: String(selecionado.photos), rotulo: selecionado.photos === 1 ? 'foto' : 'fotos' },
  ];

  const fotos = selecionado.entries.flatMap((e) =>
    e.mediaPaths.map((p) => signedUrls[p]).filter((u): u is string => Boolean(u)),
  );

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <aside className="w-full shrink-0 lg:w-56 print:hidden">
        <p className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
          Dias com registro
        </p>
        <div className="flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible">
          {dias.map((dia) => {
            const ativo = dia.date === selecionado.date;
            return (
              <Link
                key={dia.date}
                href={`/tools/andamento-obra/obras/${workId}/dia-a-dia?dia=${dia.date}`}
                aria-current={ativo ? 'page' : undefined}
                className={`min-w-40 shrink-0 rounded-lg border-l-2 px-3 py-2 transition-colors lg:min-w-0 ${
                  ativo
                    ? 'border-accent-600 bg-accent-500/10'
                    : 'border-transparent hover:bg-gray-50'
                }`}
              >
                <p
                  className={`text-sm font-semibold ${ativo ? 'text-accent-700' : 'text-neutral-900'}`}
                >
                  {diaCurto(dia.date)}
                </p>
                <p className={`text-xs ${ativo ? 'text-accent-600' : 'text-gray-500'}`}>
                  {resumoCurto(dia)}
                </p>
              </Link>
            );
          })}
        </div>
      </aside>

      <div className="min-w-0 flex-1 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-neutral-900">{diaLongo(selecionado.date)}</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Montado pelo sistema a partir de {selecionado.entries.length} registro
              {selecionado.entries.length === 1 ? '' : 's'} do campo. Ninguém digitou isto.
            </p>
          </div>
          <PrintDayButton />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {numeros.map((n) => (
            <div key={n.rotulo} className="rounded-xl border border-gray-200 bg-surface p-3">
              <p className="text-xl font-bold text-neutral-900">{n.valor}</p>
              <p className="mt-0.5 text-[11px] text-gray-500">{n.rotulo}</p>
            </div>
          ))}
        </div>

        <div>
          <p className="pb-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            A linha do dia
          </p>
          <ol className="space-y-0">
            {selecionado.entries.map((entry, i) => {
              const Icone = ICONE[entry.kind];
              const ultimo = i === selecionado.entries.length - 1;
              return (
                <li key={`${entry.kind}-${entry.id}`} className="flex gap-3">
                  <span className="w-11 shrink-0 pt-0.5 text-right text-xs tabular-nums text-gray-400">
                    {hora(entry.at)}
                  </span>
                  <div className="flex flex-col items-center">
                    <span
                      className={`mt-1 flex h-5 w-5 items-center justify-center rounded-full ${COR[entry.kind]}`}
                    >
                      <Icone className="h-3 w-3 text-white" />
                    </span>
                    {!ultimo && <span className="w-px flex-1 bg-gray-200" />}
                  </div>
                  <div className={`min-w-0 flex-1 ${ultimo ? '' : 'pb-4'}`}>
                    <p className="text-sm font-medium text-neutral-900">{entry.title}</p>
                    {entry.detail && (
                      <p className="mt-0.5 text-xs text-gray-500">{entry.detail}</p>
                    )}
                    {atrasou(entry) && (
                      <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                        <Clock className="h-3 w-3" />
                        registrado sem sinal, chegou {hora(entry.arrivedAt)}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        {fotos.length > 0 && (
          <div>
            <p className="pb-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              O que foi fotografado
            </p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              {fotos.map((url, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={`${url}-${i}`}
                  src={url}
                  alt=""
                  loading="lazy"
                  className="aspect-square w-full rounded-lg object-cover"
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
