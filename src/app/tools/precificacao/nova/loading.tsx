export default function NovaPrecificacaoLoading() {
  return (
    <main className="min-h-screen bg-gray-50 p-6 lg:p-8">
      <div className="mx-auto max-w-7xl animate-pulse space-y-4">
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="h-6 w-56 rounded bg-slate-200" />
          <div className="mt-4 h-9 w-full max-w-md rounded bg-slate-100" />
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="h-4 w-full rounded bg-slate-100" />
          <div className="mt-2 h-4 w-5/6 rounded bg-slate-100" />
          <div className="mt-2 h-4 w-2/3 rounded bg-slate-100" />
        </div>
      </div>
    </main>
  );
}
