import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  // Rede de segurança: `console.log`/`console.time` esquecidos em caminho
  // quente (achado em src/contexts/AppContext.tsx — um log por poste, 280x
  // num orçamento médio) executam de verdade em produção porque nada os
  // removia do bundle. `console.error` fica: é diagnóstico real, não debug.
  compiler: {
    removeConsole: process.env.NODE_ENV === "production" ? { exclude: ["error"] } : false,
  },
  // Os .ttf da marca são lidos do disco em runtime pelo gerador de PDF da
  // proposta. Sem isto o bundle da Vercel não os leva e o PDF sai em Helvetica —
  // falha silenciosa, detectável só por isUsingFallbackFonts(). O escopo é amplo
  // de propósito: ~1,5 MB por função é irrelevante perto de perder a marca em
  // produção porque alguém criou a rota e esqueceu de registrar o caminho aqui.
  outputFileTracingIncludes: {
    "/**": ["./src/services/pdf/proposal/fonts/**"],
  },
};

export default nextConfig;
