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
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Sobre a virada de identidade (ver DESIGN_SYSTEM.md):
 * O "navy" #1D3140 deixou de ser azul e virou grafite quente. O azul saiu do
 * papel de cor institucional de fundo e passou a ser exclusivamente cor de
 * DESTAQUE — que é onde ele efetivamente trabalha. Os nomes `navy`/`blue`
 * foram mantidos para não quebrar os consumidores existentes.
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
  /** Grafite quente. Títulos, chrome escuro, texto de máximo contraste. */
  navy: "#262623",
  /** Grafite mais fechado — base do trilho da sidebar. */
  navyDeep: "#181816",
  /** Grafite intermediário — divisórias e superfícies elevadas no escuro. */
  navySoft: "#353530",
  /** Azul ON (slate blue). Realces, estados ativos, bordas de destaque. */
  blue: "#5f8dd1",
  /** Azul claro — texto e ícones secundários sobre o grafite. */
  blueSoft: "#a7c4f0",
  /** Azul de ação — preenchimento de botão primário (AA com texto branco). */
  blueDeep: "#4472b4",
  /** Fundo padrão das telas do sistema — creme quente. */
  surface: "#fafaf8",
  /** @deprecated Use `navySoft`. Mantido por compatibilidade. */
  midNavy: "#353530",
} as const;

/**
 * Rampa completa do accent (slate blue). Necessária em contextos fora do CSS
 * — PDF, canvas — que precisam de mais de três degraus.
 */
export const ON_ACCENT_SCALE = {
  50: "#f2f6fd",
  100: "#e3edfb",
  200: "#c9dcf8",
  300: "#a7c4f0",
  400: "#7ea6e2",
  500: "#5f8dd1",
  600: "#4472b4",
  700: "#355a92",
  800: "#2b4874",
  900: "#253b5c",
  950: "#152338",
} as const;

/** Rampa completa do neutro quente, para os mesmos contextos fora do CSS. */
export const ON_NEUTRAL_SCALE = {
  50: "#fafaf8",
  100: "#f5f4f1",
  200: "#e9e8e3",
  300: "#d6d5ce",
  400: "#aaa9a2",
  500: "#84837b",
  600: "#67665f",
  700: "#504f48",
  800: "#353530",
  900: "#262623",
  950: "#181816",
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
 *
 * Nota de direção: a UI é CHAPADA. Gradiente em botão, cartão ou barra é o que
 * mais envelhece uma interface — a profundidade aqui vem de borda + sombra
 * baixíssima, não de degradê. Os gradientes sobreviventes estão restritos a
 * superfícies de marketing (hero do portal).
 * ──────────────────────────────────────────────────────────────────────────── */

/** Trilho da navegação global (sidebar): grafite quente chapado. */
export const onBrandRailClass = "bg-brand-navy";

/** Superfície de realce sobre fundo claro (pills ativas, ícones em destaque). */
export const onBrandAccentSurfaceClass =
  "border-accent-200 bg-accent-50 text-accent-700";

/** Anel de foco padrão da marca. */
export const onBrandFocusRingClass =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500";

/** Fundo padrão das telas do sistema. */
export const onBrandSurfaceClass = "bg-brand-surface";

/**
 * Botão primário do portal (“Acessar módulo”). Chapado, na cor de ação.
 * Contraste do texto branco sobre `accent-600`: 4.88:1 (AA).
 */
export const onPortalPrimaryButtonClass =
  "bg-accent-600 font-semibold text-white shadow-xs transition-colors hover:bg-accent-700 active:bg-accent-800 " +
  onBrandFocusRingClass;

/** Variante compacta (CTAs em páginas internas). */
export const onPortalPrimaryButtonSmClass =
  "bg-accent-600 font-medium text-white shadow-xs transition-colors hover:bg-accent-700 active:bg-accent-800 " +
  onBrandFocusRingClass;

/**
 * Gradiente de hero — ÚNICO lugar onde degradê é permitido. Reservado à capa
 * do portal, onde a função é atmosfera, não hierarquia de UI.
 */
export const onBrandHeroGradientClass =
  "bg-linear-140 from-neutral-900 via-neutral-800 to-accent-900";

/**
 * @deprecated A UI virou chapada. Para botões use `onPortalPrimaryButtonClass`;
 * para o trilho use `onBrandRailClass`. Mantido para não quebrar imports.
 */
export const onBrandGradientClass = onBrandHeroGradientClass;

/** @deprecated Use `onBrandRailClass`. */
export const onBrandRailGradientClass = onBrandRailClass;
