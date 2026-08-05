import type { Metadata } from "next";
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
          tela aparece clara e pisca para o escuro na hidratação. Por isso é
          `dangerouslySetInnerHTML` com string, e não um componente.
          Conteúdo estático nosso, sem interpolação de dado externo.
        */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
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
