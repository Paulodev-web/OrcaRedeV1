/**
 * Cores de pasta — paleta escolhível pelo usuário.
 *
 * Precisa viver em hex (e não em classe Tailwind) porque o valor é persistido
 * por pasta no banco e aplicado via `style`. São os únicos hex "soltos"
 * legítimos da UI; todos saem das mesmas rampas OKLCH do design system, no
 * degrau 600 — presença suficiente num ícone de 20px sobre o fundo em 10%.
 *
 * Ver DESIGN_SYSTEM.md.
 */

export interface FolderColorOption {
  name: string;
  value: string;
}

export const FOLDER_COLORS: readonly FolderColorOption[] = [
  { name: "Azul", value: "#4472b4" }, // accent-600
  { name: "Verde", value: "#357d49" }, // green-600
  { name: "Teal", value: "#257a7b" }, // teal-600
  { name: "Âmbar", value: "#925f26" }, // amber-600
  { name: "Laranja", value: "#a94c29" }, // orange-600
  { name: "Vermelho", value: "#ae443d" }, // red-600
  { name: "Roxo", value: "#7b59a1" }, // purple-600
  { name: "Rosa", value: "#9d4a7c" }, // pink-600
  { name: "Cinza", value: "#67665f" }, // neutral-600
] as const;

export const DEFAULT_FOLDER_COLOR = FOLDER_COLORS[0].value;

/**
 * Cores gravadas antes da virada de identidade — a paleta saturada padrão do
 * Tailwind v3. Ficaram estridentes sobre o creme quente do sistema novo.
 *
 * O mapeamento acontece na LEITURA, não por migração de banco: reescrever a
 * coluna perderia a escolha original do usuário e não haveria volta se a
 * paleta mudasse de novo. Pastas antigas passam a exibir o equivalente da
 * paleta nova; se o usuário reeditar a pasta, o valor novo é gravado.
 */
const LEGACY_COLOR_MAP: Readonly<Record<string, string>> = {
  "#3b82f6": "#4472b4", // azul saturado  -> accent-600
  "#10b981": "#357d49", // esmeralda      -> green-600
  "#14b8a6": "#257a7b", // teal           -> teal-600
  "#f59e0b": "#925f26", // amarelo        -> amber-600
  "#f97316": "#a94c29", // laranja        -> orange-600
  "#ef4444": "#ae443d", // vermelho       -> red-600
  "#8b5cf6": "#7b59a1", // roxo           -> purple-600
  "#ec4899": "#9d4a7c", // rosa           -> pink-600
  "#6b7280": "#67665f", // cinza          -> neutral-600
};

/**
 * Resolve a cor de exibição de uma pasta, traduzindo valores legados e caindo
 * no padrão quando a pasta não tem cor.
 */
export function resolveFolderColor(color?: string | null): string {
  if (!color) return DEFAULT_FOLDER_COLOR;
  return LEGACY_COLOR_MAP[color.toLowerCase()] ?? color;
}
