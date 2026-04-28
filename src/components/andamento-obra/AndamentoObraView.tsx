"use client";

import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { ON_BRAND } from "@/lib/branding";

export function AndamentoObraView() {
  const { user, loading: loadingAuth } = useAuth();

  if (loadingAuth) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">
        Verificando sessão...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-gray-700">
          Faça login no portal principal para acessar o módulo de andamento de obra.
        </p>
        <Link
          href="/"
          className="mt-3 inline-flex text-sm font-medium text-[#64ABDE] hover:brightness-95"
        >
          Ir para o portal
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs text-gray-400">
          <Link href="/" className="hover:text-[#64ABDE]">
            Portal
          </Link>
          <span className="mx-1">/</span>
          <span className="text-gray-600">Andamento de Obra</span>
        </p>
        <h1 className="mt-1 text-2xl font-bold text-[#1D3140]">Andamento de Obra</h1>
        <p className="mt-1 max-w-2xl text-sm text-gray-500">
          Central para acompanhar cronograma, marcos e status das obras. Este módulo está em
          evolução; em breve você poderá registrar avanços, pendências e indicadores por projeto.
        </p>
      </div>

      <div
        className="rounded-2xl border border-[#64ABDE]/30 bg-white p-8 shadow-sm"
        style={{
          borderLeftWidth: "4px",
          borderLeftColor: ON_BRAND.blue,
        }}
      >
        <p className="text-sm text-[#1D3140]">
          Nenhuma obra vinculada ainda. Quando as integrações estiverem ativas, a lista de obras e o
          painel de andamento aparecerão aqui.
        </p>
      </div>
    </div>
  );
}
