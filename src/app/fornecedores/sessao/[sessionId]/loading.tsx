export default function QuotationSessionLoading() {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="animate-pulse rounded-2xl border border-[#64ABDE]/30 bg-white p-6 shadow-sm">
        <div className="h-3 w-48 rounded bg-slate-200" />
        <div className="mt-6 flex gap-3">
          <div className="h-11 w-11 shrink-0 rounded-xl bg-slate-200" />
          <div className="flex-1 space-y-2">
            <div className="h-7 max-w-sm rounded bg-slate-200" />
            <div className="h-4 max-w-md rounded bg-slate-100" />
          </div>
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          <div className="h-8 w-24 rounded-full bg-slate-100" />
          <div className="h-8 w-28 rounded-full bg-slate-100" />
          <div className="h-8 w-24 rounded-full bg-slate-100" />
        </div>
      </div>
      <div className="animate-pulse rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="h-5 w-40 rounded bg-slate-200" />
        <div className="mt-4 h-32 rounded-lg bg-slate-100" />
      </div>
    </div>
  );
}
