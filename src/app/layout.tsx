import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";
import Providers from "@/providers/Providers";

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
    <html lang="pt-BR">
      <body className="antialiased">
        <Providers>
          {children}
        </Providers>
        <Toaster richColors position="bottom-right" />
      </body>
    </html>
  );
}
