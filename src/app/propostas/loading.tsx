export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-surface">
      <div className="flex items-center gap-3 text-sm text-slate-500">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-brand-navy" />
        Carregando propostas…
      </div>
    </div>
  );
}
