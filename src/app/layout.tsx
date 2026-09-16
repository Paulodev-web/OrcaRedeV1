import type { Metadata } from "next";
import Script from "next/script";
import { Toaster } from "sonner";
import "./globals.css";
import Providers from "@/providers/Providers";
import { themeScript } from "@/components/theme/ThemeProvider";

export const metadata: Metadata = {
  title: "OrcaRede",
  description: "Sistema de orçamentos para redes elétricas",
  icons: {
    icon: [{ url: "/OnEngenharia.webp", type: "image/webp" }],
    apple: [{ url: "/OnEngenharia.webp", type: "image/webp" }],
  },
  openGraph: {
    title: "OrcaRede",
    description: "Sistema de orçamentos para redes elétricas",
    images: [{ url: "/OnEngenharia.webp" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // `suppressHydrationWarning`: o script abaixo escreve `data-theme` e
    // `color-scheme` no <html> antes do React hidratar, então o DOM real
    // diverge do HTML do servidor por definição. É o único elemento onde essa
    // divergência é esperada — não estender para os filhos.
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        {/*
          Anti-flash: precisa rodar SÍNCRONO antes da primeira pintura, senão a
          tela aparece clara e pisca para o escuro na hidratação. Conteúdo
          estático nosso, sem interpolação de dado externo.

          Vai por `next/script` com `beforeInteractive`, e não por uma tag
          `<script>` crua, porque o React avisa no console que script renderizado
          como elemento nunca executa em render de cliente:

            Encountered a script tag while rendering React component.

          No primeiro carregamento a tag crua até funcionava (o HTML do servidor
          a traz pronta), mas o aviso é legítimo e, em navegação client-side,
          uma tag assim de fato não roda. `beforeInteractive` é a forma que o
          Next injeta o conteúdo no documento antes da hidratação, que é
          exatamente a garantia que o anti-flash precisa.
        */}
        <Script id="theme-anti-flash" strategy="beforeInteractive">
          {themeScript}
        </Script>
      </head>
      <body className="antialiased">
        <Providers>
          {children}
        </Providers>
        <Toaster richColors position="bottom-right" theme="system" />
      </body>
    </html>
  );
}
