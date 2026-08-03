import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
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
