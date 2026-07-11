export default function AndamentoObraLoading() {
  return (
    <main className="p-6 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="animate-pulse">
          <div className="h-7 w-64 rounded bg-slate-200" />
          <div className="mt-2 h-4 w-96 max-w-full rounded bg-slate-100" />
        </div>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,3fr)]">
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="animate-pulse rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
              >
                <div className="h-4 w-1/2 rounded bg-slate-200" />
                <div className="mt-3 h-3 w-full rounded bg-slate-100" />
                <div className="mt-2 h-3 w-2/3 rounded bg-slate-100" />
              </div>
            ))}
          </div>
          <div className="animate-pulse rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="h-4 w-1/3 rounded bg-slate-200" />
            <div className="mt-4 space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-3 w-full rounded bg-slate-100" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
