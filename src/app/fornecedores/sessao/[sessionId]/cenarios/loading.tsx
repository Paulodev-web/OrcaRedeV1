/**
 * Existe por dois motivos, os dois medidos em produção.
 *
 * O visível: sem `loading`, a navegação para esta aba mudava a URL e deixava a
 * tela anterior parada até o servidor terminar. Agora o esqueleto aparece na
 * hora e a página entra quando fica pronta.
 *
 * O invisível, que é o mais caro: o prefetch de uma rota dinâmica para no
 * primeiro `loading` do caminho. Sem um aqui, cada link para esta aba fazia o
 * servidor renderizar a página inteira, com todas as consultas dela, antes de
 * alguém clicar.
 */
export default function SessionCenariosLoading() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <div className="animate-pulse rounded-2xl border border-accent-500/30 bg-surface p-6 shadow-sm">
        <div className="h-5 w-56 rounded bg-slate-200" />
        <div className="mt-2 h-4 max-w-md rounded bg-slate-100" />
      </div>
      <div className="animate-pulse rounded-2xl border border-slate-200 bg-surface p-5 shadow-sm">
        <div className="flex gap-3">
          <div className="h-9 flex-1 rounded-lg bg-slate-100" />
          <div className="h-9 w-32 rounded-lg bg-slate-100" />
        </div>
        <div className="mt-4 space-y-2">
          <div className="h-10 rounded bg-slate-100" />
          <div className="h-10 rounded bg-slate-100" />
          <div className="h-10 rounded bg-slate-100" />
          <div className="h-10 rounded bg-slate-100" />
          <div className="h-10 rounded bg-slate-100" />
          <div className="h-10 rounded bg-slate-100" />
          <div className="h-10 rounded bg-slate-100" />
          <div className="h-10 rounded bg-slate-100" />
          <div className="h-10 rounded bg-slate-100" />
          <div className="h-10 rounded bg-slate-100" />
        </div>
      </div>
    </div>
  );
}
