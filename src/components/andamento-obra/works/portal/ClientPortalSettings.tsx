'use client';

import { useRef, useState, useTransition } from 'react';
import {
  Check,
  Copy,
  ExternalLink,
  ImagePlus,
  Loader2,
  RefreshCw,
  Save,
  Trash2,
} from 'lucide-react';
import {
  addWorkClientPortalImage,
  removeWorkClientPortalImage,
  removeWorkClientPortalLogo,
  updateWorkClientPortal,
  uploadWorkClientPortalLogo,
} from '@/actions/workClientPortal';
import { resyncWorkTracking } from '@/actions/workPoleInstallations';
import type {
  WorkClientPortal,
  WorkPortalImage,
} from '@/services/works/getWorkClientPortal';

interface ClientPortalSettingsProps {
  workId: string;
  portal: WorkClientPortal;
}

/**
 * Tudo que o cliente lê, editado de dentro da obra.
 *
 * Esta aba é o que sobrou de útil do Portal do Engenheiro depois que postes,
 * progresso e timeline passaram a ser derivados da obra. O que continua sendo
 * escrito à mão é justamente o que a execução não sabe dizer: como descrever a
 * obra para quem a contratou, o que destacar nesta semana, e quais fotos valem
 * ser mostradas.
 *
 * A separação entre as duas metades da tela é a regra do módulo inteira em
 * miniatura: em cima, o que a obra deriva e ninguém digita; embaixo, o que só
 * uma pessoa sabe escrever.
 */
export function ClientPortalSettings({ workId, portal }: ClientPortalSettingsProps) {
  const [descricao, setDescricao] = useState(portal.projectDescription ?? '');
  const [focoTitulo, setFocoTitulo] = useState(portal.currentFocusTitle ?? '');
  const [focoTexto, setFocoTexto] = useState(portal.currentFocusDescription ?? '');
  const [responsavel, setResponsavel] = useState(portal.responsiblePerson ?? '');
  const [equipPrev, setEquipPrev] = useState(numText(portal.plannedEquipment));
  const [equipFeito, setEquipFeito] = useState(numText(portal.equipmentInstalled));
  const [ipPrev, setIpPrev] = useState(numText(portal.plannedPublicLighting));
  const [ipFeito, setIpFeito] = useState(numText(portal.publicLightingInstalled));

  const [logoUrl, setLogoUrl] = useState(portal.clientLogoUrl);
  const [imagens, setImagens] = useState<WorkPortalImage[]>(portal.images);

  const [salvando, startSalvar] = useTransition();
  const [salvo, setSalvo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [subindoLogo, setSubindoLogo] = useState(false);
  const [subindoFoto, setSubindoFoto] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [ressincronizando, startResync] = useTransition();

  const logoInputRef = useRef<HTMLInputElement>(null);
  const fotoInputRef = useRef<HTMLInputElement>(null);

  const href = portal.publicId ? `/obra/${portal.publicId}` : null;
  const publicHref = portal.publicEnabled ? href : null;

  function handleSalvar() {
    setErro(null);
    setSalvo(false);
    startSalvar(async () => {
      const r = await updateWorkClientPortal({
        workId,
        projectDescription: descricao,
        currentFocusTitle: focoTitulo,
        currentFocusDescription: focoTexto,
        responsiblePerson: responsavel,
        plannedEquipment: textNum(equipPrev),
        equipmentInstalled: textNum(equipFeito),
        plannedPublicLighting: textNum(ipPrev),
        publicLightingInstalled: textNum(ipFeito),
      });
      if (r.success) {
        setSalvo(true);
        setTimeout(() => setSalvo(false), 2500);
      } else {
        setErro(r.error);
      }
    });
  }

  async function handleLogo(file: File | null) {
    if (!file) return;
    setErro(null);
    setSubindoLogo(true);
    const fd = new FormData();
    fd.set('workId', workId);
    fd.set('file', file);
    const r = await uploadWorkClientPortalLogo(fd);
    setSubindoLogo(false);
    if (r.success && r.data) setLogoUrl(r.data.url);
    else if (!r.success) setErro(r.error);
    if (logoInputRef.current) logoInputRef.current.value = '';
  }

  async function handleFoto(file: File | null) {
    if (!file) return;
    setErro(null);
    setSubindoFoto(true);
    const fd = new FormData();
    fd.set('workId', workId);
    fd.set('file', file);
    const r = await addWorkClientPortalImage(fd);
    setSubindoFoto(false);
    if (r.success && r.data) setImagens(r.data.images);
    else if (!r.success) setErro(r.error);
    if (fotoInputRef.current) fotoInputRef.current.value = '';
  }

  async function handleRemoverFoto(id: string) {
    setErro(null);
    const r = await removeWorkClientPortalImage(workId, id);
    if (r.success && r.data) setImagens(r.data.images);
    else if (!r.success) setErro(r.error);
  }

  function handleCopiar() {
    if (!href) return;
    navigator.clipboard.writeText(`${window.location.origin}${href}`).then(
      () => {
        setCopiado(true);
        setTimeout(() => setCopiado(false), 2000);
      },
      () => setErro('Não foi possível copiar o link.'),
    );
  }

  return (
    <div className="space-y-6">
      {/* ── O link ──────────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-gray-200 bg-surface p-5">
        <h2 className="text-sm font-semibold text-neutral-900">
          O que o cliente abre
        </h2>
        {href && !portal.publicEnabled ? (
          <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Portal despublicado. O endereço continua reservado, mas o cliente
            não consegue abrir enquanto a obra estiver cancelada.
          </p>
        ) : publicHref ? (
          <>
            <p className="mt-1 text-xs text-gray-500">
              <strong className="font-semibold text-neutral-900">
                {portal.polesPublished} de {portal.polesPlanned}
              </strong>{' '}
              postes publicados, {portal.progressPercentage}% de progresso. Esses
              números saem da obra e não se editam aqui.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <a
                href={publicHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-neutral-900 transition-colors hover:bg-gray-50"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Abrir
              </a>
              <button
                type="button"
                onClick={handleCopiar}
                className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-neutral-900 transition-colors hover:bg-gray-50"
              >
                {copiado ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                {copiado ? 'Copiado' : 'Copiar link'}
              </button>
              <button
                type="button"
                onClick={() =>
                  startResync(async () => {
                    const r = await resyncWorkTracking(workId);
                    if (!r.success) setErro(r.error);
                  })
                }
                disabled={ressincronizando}
                className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100 disabled:opacity-60"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${ressincronizando ? 'animate-spin' : ''}`} />
                Ressincronizar com o orçamento
              </button>
            </div>
          </>
        ) : (
          <p className="mt-1 text-xs text-gray-500">
            Esta obra ainda não tem portal do cliente. Ele nasce quando a obra
            vem de um orçamento.
          </p>
        )}
      </section>

      {erro && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {erro}
        </p>
      )}

      {/* ── Texto ───────────────────────────────────────────────────────── */}
      <section className="space-y-4 rounded-2xl border border-gray-200 bg-surface p-5">
        <div>
          <h2 className="text-sm font-semibold text-neutral-900">
            O que você conta ao cliente
          </h2>
          <p className="mt-1 text-xs text-gray-500">
            Campo em branco não fica em branco na página: ela cai num texto
            genérico, escrito no código. O cinza que aparece dentro de cada
            caixa abaixo é exatamente a frase que o cliente lê hoje.
          </p>
        </div>

        <Campo
          id="descricao-projeto"
          label="Descrição do projeto"
          hint="O parágrafo logo abaixo do nome da obra."
        >
          <textarea
            id="descricao-projeto"
            rows={3}
            value={descricao}
            maxLength={2000}
            placeholder={PADRAO_DESCRICAO}
            onChange={(e) => setDescricao(e.target.value)}
            className={inputCls}
          />
        </Campo>

        <Campo id="responsavel-portal" label="Responsável" hint="Nome que o cliente vê.">
          <input
            id="responsavel-portal"
            type="text"
            value={responsavel}
            maxLength={120}
            onChange={(e) => setResponsavel(e.target.value)}
            className={inputCls}
          />
        </Campo>

        {/* Os dois campos abaixo são o título e o corpo da MESMA caixa de
            destaque na página do cliente. Separá-los em seções diferentes,
            como era no Portal antigo, fazia parecer que eram coisas distintas. */}
        <div className="rounded-lg border border-gray-200 bg-gray-50/60 p-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            Caixa de destaque
          </p>
          <div className="space-y-3">
            <Campo id="foco-titulo" label="Título">
              <input
                id="foco-titulo"
                type="text"
                value={focoTitulo}
                maxLength={120}
                placeholder="Mensagem personalizada"
                onChange={(e) => setFocoTitulo(e.target.value)}
                className={inputCls}
              />
            </Campo>
            <Campo id="foco-texto" label="Texto">
              <textarea
                id="foco-texto"
                rows={3}
                value={focoTexto}
                maxLength={2000}
                placeholder={PADRAO_DESTAQUE}
                onChange={(e) => setFocoTexto(e.target.value)}
                className={inputCls}
              />
            </Campo>
          </div>
        </div>
      </section>

      {/* ── Contadores ──────────────────────────────────────────────────── */}
      <section className="space-y-3 rounded-2xl border border-gray-200 bg-surface p-5">
        <div>
          <h2 className="text-sm font-semibold text-neutral-900">
            Equipamento e iluminação
          </h2>
          <p className="mt-1 text-xs text-gray-500">
            Contados à mão, porque a obra ainda não deriva estes dois. Poste e
            rede vêm do campo e não aparecem aqui.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Campo id="equip-prev" label="Equipamentos previstos">
            <input id="equip-prev" type="number" min={0} value={equipPrev}
              onChange={(e) => setEquipPrev(e.target.value)} className={inputCls} />
          </Campo>
          <Campo id="equip-feito" label="Equipamentos instalados">
            <input id="equip-feito" type="number" min={0} value={equipFeito}
              onChange={(e) => setEquipFeito(e.target.value)} className={inputCls} />
          </Campo>
          <Campo id="ip-prev" label="Iluminação prevista">
            <input id="ip-prev" type="number" min={0} value={ipPrev}
              onChange={(e) => setIpPrev(e.target.value)} className={inputCls} />
          </Campo>
          <Campo id="ip-feito" label="Iluminação instalada">
            <input id="ip-feito" type="number" min={0} value={ipFeito}
              onChange={(e) => setIpFeito(e.target.value)} className={inputCls} />
          </Campo>
        </div>
      </section>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSalvar}
          disabled={salvando}
          className="inline-flex items-center gap-1.5 rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-700 disabled:opacity-60"
        >
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {salvando ? 'Salvando…' : 'Salvar'}
        </button>
        {salvo && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
            <Check className="h-3.5 w-3.5" /> Salvo
          </span>
        )}
      </div>

      {/* ── Logo ────────────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-gray-200 bg-surface p-5">
        <h2 className="text-sm font-semibold text-neutral-900">Logo do cliente</h2>
        <p className="mt-1 text-xs text-gray-500">
          Aparece no topo da página que o cliente abre.
        </p>
        <div className="mt-3 flex items-center gap-3">
          {logoUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logoUrl}
                alt="Logo exibida na página do cliente"
                className="h-12 w-auto max-w-[160px] rounded border border-gray-200 bg-white object-contain p-1"
              />
              <button
                type="button"
                onClick={async () => {
                  const r = await removeWorkClientPortalLogo(workId);
                  if (r.success) setLogoUrl(null);
                  else setErro(r.error);
                }}
                className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-2.5 py-1.5 text-xs text-gray-700 transition-colors hover:bg-gray-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remover
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => logoInputRef.current?.click()}
              disabled={subindoLogo}
              className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-gray-300 px-3 py-2 text-xs text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-60"
            >
              {subindoLogo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
              {subindoLogo ? 'Enviando…' : 'Enviar logo'}
            </button>
          )}
          <input ref={logoInputRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => void handleLogo(e.target.files?.[0] ?? null)} />
        </div>
      </section>

      {/* ── Galeria ─────────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-gray-200 bg-surface p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-neutral-900">
              Galeria da obra
            </h2>
            <p className="mt-1 text-xs text-gray-500">
              As fotos que você escolhe mostrar. Não se confunde com a galeria
              interna, que traz tudo que o campo registrou.
            </p>
          </div>
          <button
            type="button"
            onClick={() => fotoInputRef.current?.click()}
            disabled={subindoFoto}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-neutral-900 transition-colors hover:bg-gray-50 disabled:opacity-60"
          >
            {subindoFoto ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
            {subindoFoto ? 'Enviando…' : 'Adicionar foto'}
          </button>
          <input ref={fotoInputRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => void handleFoto(e.target.files?.[0] ?? null)} />
        </div>

        {imagens.length === 0 ? (
          <p className="mt-3 rounded-md border border-dashed border-gray-200 bg-gray-50 px-3 py-4 text-center text-xs text-gray-500">
            Nenhuma foto na galeria do cliente.
          </p>
        ) : (
          <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {imagens.map((img) => (
              <li key={img.id} className="group relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.url}
                  alt={img.description || img.name}
                  className="aspect-video w-full rounded-md border border-gray-200 object-cover"
                  loading="lazy"
                />
                <button
                  type="button"
                  onClick={() => void handleRemoverFoto(img.id)}
                  aria-label={`Remover ${img.name} da galeria`}
                  className="absolute right-1.5 top-1.5 rounded-full bg-neutral-900/80 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/**
 * Os textos que a página do cliente usa quando o campo está vazio.
 *
 * Copiados de `PublicWorkViewPremium` de propósito, e não importados: lá eles
 * são conteúdo dentro do JSX, aqui são só a pré-visualização de "o que sai se
 * eu não escrever nada". Se um dia divergirem, o estrago é um placeholder
 * desatualizado nesta tela, não a página do cliente errada.
 */
const PADRAO_DESCRICAO =
  'Painel executivo com visao de avanco fisico da obra, evolucao da rede, marcos de entrega e registros visuais.';
const PADRAO_DESTAQUE =
  'Priorizar finalização dos postes e consolidação da rede para acelerar o encerramento.';

const inputCls =
  'w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-neutral-900 placeholder:text-gray-400 focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900';

function Campo({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-gray-700">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-gray-500">{hint}</p>}
    </div>
  );
}

function numText(v: number | null): string {
  return v === null || v === undefined ? '' : String(v);
}

function textNum(v: string): number | null {
  const t = v.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}
