/** Logo ON Engenharia — coloque o arquivo em `public/OnEngenharia.webp`. */
export const ON_ENGENHARIA_LOGO_SRC = "/OnEngenharia.webp";

/** Paleta do Portal Administrativo — mesma base que `AdminPortal.tsx` */
export const ON_BRAND = {
  navy: "#1D3140",
  blue: "#64ABDE",
  midNavy: "#223f52",
} as const;

/** Botão primário do portal (“Acessar módulo”): gradiente navy → azul ON */
export const onPortalPrimaryButtonClass =
  "font-semibold text-white shadow-sm transition-all hover:brightness-95 active:brightness-90 bg-[linear-gradient(135deg,#1D3140_0%,#64ABDE_100%)]";

/** Variante compacta (CTAs em páginas internas) */
export const onPortalPrimaryButtonSmClass =
  "font-medium text-white shadow-sm transition-all hover:brightness-95 bg-[linear-gradient(135deg,#1D3140_0%,#64ABDE_100%)]";
