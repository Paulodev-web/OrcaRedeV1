/**
 * Tokens de marca ON Engenharia — fonte única.
 *
 * Os valores hexadecimais vivem aqui e são espelhados no bloco `@theme` de
 * `src/app/globals.css`, que é quem gera as classes utilitárias nomeadas
 * (`bg-brand-navy`, `text-brand-navy`, `border-brand-blue/40`, …).
 *
 * Regra de consumo:
 *   - Em componentes React/Tailwind, use SEMPRE as classes nomeadas ou os
 *     `*Class` exportados abaixo. Nunca escreva o hex na mão.
 *   - Os hex de `ON_BRAND` existem apenas para contextos que não passam pelo
 *     CSS do app (geração de PDF, canvas, e-mail, exportações).
 *
 * Ao alterar um valor aqui, alterar o token equivalente em `globals.css`.
 */

/** Logo ON Engenharia — arquivo em `public/OnEngenharia.webp`. */
export const ON_ENGENHARIA_LOGO_SRC = "/OnEngenharia.webp";

/** Dimensões intrínsecas do logo, para `next/image`. */
export const ON_ENGENHARIA_LOGO_SIZE = { width: 1024, height: 776 } as const;

/**
 * Paleta da marca em hex. Espelhada em `@theme` (globals.css) como
 * `--color-brand-*`.
 */
export const ON_BRAND = {
  /** Cor institucional principal. Texto de destaque, chrome escuro. */
  navy: "#1D3140",
  /** Navy mais fechado — base do gradiente da sidebar. */
  navyDeep: "#14232E",
  /** Navy intermediário — parada do meio nos gradientes de hero. */
  navySoft: "#223F52",
  /** Azul ON. Realces, estados ativos, bordas de destaque. */
  blue: "#64ABDE",
  /** Azul claro — texto secundário sobre navy. */
  blueSoft: "#8EC3E8",
  /** Azul fechado — hover de elementos azuis sobre fundo claro. */
  blueDeep: "#3F8EC5",
  /** Fundo padrão das telas do sistema. */
  surface: "#F1F5F9",
  /** @deprecated Use `navySoft`. Mantido por compatibilidade. */
  midNavy: "#223F52",
} as const;

/**
 * Mesma paleta como referência às CSS custom properties. Útil quando é preciso
 * uma cor em `style={{}}` sem perder o vínculo com o token.
 */
export const ON_BRAND_VAR = {
  navy: "var(--color-brand-navy)",
  navyDeep: "var(--color-brand-navy-deep)",
  navySoft: "var(--color-brand-navy-soft)",
  blue: "var(--color-brand-blue)",
  blueSoft: "var(--color-brand-blue-soft)",
  blueDeep: "var(--color-brand-blue-deep)",
  surface: "var(--color-brand-surface)",
} as const;

/* ────────────────────────────────────────────────────────────────────────────
 * Classes utilitárias nomeadas
 * ──────────────────────────────────────────────────────────────────────────── */

/** Gradiente institucional 135° (navy → azul ON). Botões e faixas de destaque. */
export const onBrandGradientClass = "bg-linear-135 from-brand-navy to-brand-blue";

/** Gradiente de hero 140°, com parada intermediária em navy soft. */
export const onBrandHeroGradientClass =
  "bg-linear-140 from-brand-navy via-brand-navy-soft to-brand-blue";

/** Gradiente vertical do chrome escuro (sidebar). */
export const onBrandRailGradientClass = "bg-linear-to-b from-brand-navy to-brand-navy-deep";

/** Superfície de realce sobre fundo claro (pills ativas, ícones em destaque). */
export const onBrandAccentSurfaceClass = "border-brand-blue/40 bg-brand-blue/15 text-brand-navy";

/** Anel de foco padrão da marca. */
export const onBrandFocusRingClass =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue";

/** Fundo padrão das telas do sistema. */
export const onBrandSurfaceClass = "bg-brand-surface";

/** Botão primário do portal (“Acessar módulo”): gradiente navy → azul ON */
export const onPortalPrimaryButtonClass = `font-semibold text-white shadow-sm transition-all hover:brightness-95 active:brightness-90 ${onBrandGradientClass}`;

/** Variante compacta (CTAs em páginas internas) */
export const onPortalPrimaryButtonSmClass = `font-medium text-white shadow-sm transition-all hover:brightness-95 ${onBrandGradientClass}`;
