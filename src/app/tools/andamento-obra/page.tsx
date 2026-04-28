import type { Metadata } from "next";
import { AndamentoObraView } from "@/components/andamento-obra/AndamentoObraView";

export const metadata: Metadata = {
  title: "Andamento de Obra — OrcaRede",
  description: "Acompanhamento de cronograma e status das obras.",
};

export default function AndamentoObraPage() {
  return (
    <main className="min-h-screen bg-gray-50 p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <AndamentoObraView />
      </div>
    </main>
  );
}
