export default function QuotationSessionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <main className="min-h-screen bg-slate-100 p-6 lg:p-8">{children}</main>;
}
