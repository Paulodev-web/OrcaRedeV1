export default function QuotationSessionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen flex-col bg-slate-100 p-6 lg:p-8">
      <div className="flex min-h-0 w-full flex-1 flex-col">{children}</div>
    </main>
  );
}
