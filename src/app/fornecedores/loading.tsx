export default function FornecedoresLoading() {
  return (
    <main className="min-h-screen bg-slate-100 p-6 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <div className="animate-pulse rounded-2xl border border-[#64ABDE]/30 bg-white p-6 shadow-sm">
          <div className="h-3 w-40 rounded bg-slate-200" />
          <div className="mt-6 h-8 max-w-md rounded bg-slate-200" />
          <div className="mt-2 h-4 max-w-lg rounded bg-slate-100" />
          <div className="mt-6 flex flex-wrap gap-2">
            <div className="h-8 w-24 rounded-full bg-slate-100" />
            <div className="h-8 w-28 rounded-full bg-slate-100" />
            <div className="h-8 w-24 rounded-full bg-slate-100" />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="animate-pulse rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="h-4 w-3/4 rounded bg-slate-200" />
              <div className="mt-3 h-3 w-full rounded bg-slate-100" />
              <div className="mt-2 h-3 w-2/3 rounded bg-slate-100" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
