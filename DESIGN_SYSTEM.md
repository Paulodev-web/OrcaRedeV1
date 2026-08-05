# Design System — OrcaRede / ON Engenharia

Fonte de verdade: [`src/app/globals.css`](src/app/globals.css) (tokens CSS) e
[`src/lib/branding.ts`](src/lib/branding.ts) (mesmos valores em TS, para
contextos que não passam pelo CSS — PDF, canvas, exportações).

**Alterou um, altere o outro.**

---

## 1. A ideia central

A interface é **neutro quente + um único acento azul**. Nada mais.

O fundo não é branco puro nem cinza frio: é um creme (`#fafaf8`). O texto não é
preto: é um grafite quente (`#262623`). Essa temperatura é o que separa uma tela
que parece "software genérico" de uma que parece desenhada.

O azul é a **única** cor de destaque. Se ele aparece em tudo, não destaca nada.

### De onde veio o azul

O pedido foi "um azul com a mesma pegada do laranja do Claude". Isso é uma
propriedade mensurável, não uma vibe. O laranja do Claude é `#D97757`, que em
OKLCH é:

```
oklch(0.672  0.131  38.8°)
       │      │      └── matiz: laranja terroso
       │      └───────── croma: contido (Tailwind blue-500 tem 0.214 — quase o dobro)
       └──────────────── leveza
```

O accent do sistema é **esse mesmo caráter com a matiz girada para 258°**:
croma na mesma faixa (0.10–0.12), leveza escalonada numa rampa. O resultado é um
slate blue empoeirado — azul de verdade, mas sem o brilho digital de um
`blue-500` de framework.

Toda a paleta foi **gerada em OKLCH**, não escolhida a olho. OKLCH é
perceptualmente uniforme: dois tons com o mesmo `L` parecem ter a mesma
luminosidade, o que HSL não garante. Por isso `green-600`, `red-600` e
`accent-600` têm exatamente o mesmo peso visual — nenhum status grita mais alto
que o outro por acidente.

---

## 2. Paleta

### Neutro quente (hue 100)

Substitui `gray`, `slate`, `zinc`, `stone`, `neutral` do Tailwind.

| Degrau | Hex | Uso |
|---|---|---|
| 50 | `#fafaf8` | fundo da página (creme) |
| 100 | `#f5f4f1` | superfície rebaixada, hover sutil |
| 200 | `#e9e8e3` | **bordas** (padrão do sistema) |
| 300 | `#d6d5ce` | borda forte, scrollbar |
| 400 | `#aaa9a2` | ícone decorativo, placeholder |
| 500 | `#84837b` | texto terciário |
| 600 | `#67665f` | texto secundário (5.5:1) |
| 700 | `#504f48` | texto de corpo (7.9:1) |
| 800 | `#353530` | superfície elevada no escuro |
| 900 | `#262623` | **títulos** (14.5:1) |
| 950 | `#181816` | grafite mais fechado |

### Accent — slate blue (hue 258)

Substitui `blue`, `sky`, `indigo`.

| Degrau | Hex | Uso |
|---|---|---|
| 50 | `#f2f6fd` | fundo de pill/badge |
| 200 | `#c9dcf8` | borda de realce |
| 300 | `#a7c4f0` | ícone ativo **sobre o trilho escuro** (8.6:1) |
| 500 | `#5f8dd1` | **cor da marca** — bordas, anel de foco, realces |
| 600 | `#4472b4` | **cor da ação** — preenchimento de botão (branco por cima: 4.88:1) |
| 700 | `#355a92` | hover do botão primário |
| 900 | `#253b5c` | fim do gradiente de hero |

> **A distinção 500 vs 600 não é decorativa.** Texto branco sobre o 500 dá
> 3.38:1 — reprova em AA. Sobre o 600 dá 4.88:1 — aprova. Preenchimento com
> texto branco é **sempre** 600.

### Semânticas

Todas com o degrau 600 validado (AA sobre o creme **e** com branco por cima) e
dentro do gamut sRGB.

| Papel | Matiz | 600 | Onde |
|---|---|---|---|
| verde | 150° | `#357d49` | sucesso, orçamento finalizado |
| teal | 196° | `#257a7b` | em andamento |
| âmbar | 65° | `#925f26` | atenção, pendência |
| laranja | 40° | `#a94c29` | acento quente raro (matiz do laranja Claude) |
| vermelho | 27° | `#ae443d` | destrutivo, erro |
| roxo | 305° | `#7b59a1` | orçamento-modelo |
| rosa | 345° | `#9d4a7c` | cor de pasta |

O vermelho leva croma ~22% maior de propósito: precisa ler como perigo mesmo
dentro de uma paleta contida.

---

## 3. A decisão que mais importa entender

**As rampas nativas do Tailwind estão redefinidas.**

```css
--color-gray-500: var(--color-neutral-500);   /* não é mais o cinza do Tailwind */
--color-blue-600: var(--color-accent-600);    /* não é mais o azul do Tailwind */
```

Por quê: o app tinha ~3.700 usos de `gray-*`, `slate-*` e `blue-*` espalhados em
169 arquivos. Reescrever tudo seria uma varredura gigante com enorme superfície
de regressão. Reapontar a rampa re-veste o sistema inteiro numa edição.

**Consequência prática:** `text-gray-500` no código produz o neutro **quente**
daqui, não o cinza frio do Tailwind. Isso é esperado. Não "conserte".

**Ao escrever código novo,** prefira os nomes reais — `neutral-*`, `accent-*` —
que dizem a verdade sobre o que fazem.

---

## 4. Papéis semânticos

Nomeados por **função**, não por aparência. É a única camada que um tema escuro
precisa sobrescrever.

| Token | Claro | Papel |
|---|---|---|
| `surface` | `#ffffff` | superfície de cartão/modal |
| `surface-sunken` | neutral-50 | fundo da página |
| `foreground` | neutral-900 | texto principal |
| `foreground-muted` | neutral-600 | texto secundário |
| `border-subtle` | neutral-200 | borda padrão |

Prefira `bg-surface` a `bg-white`: quando o tema escuro entrar, `bg-white`
continuará branco e furará o tema.

### O trilho da navegação é CLARO no tema claro

Sidebar preta sobre conteúdo claro é resquício de "chrome escuro" — no tema
claro o app é claro inteiro, trilho incluído. A separação vem de **contraste de
superfície + borda**, não de inversão de luminosidade:

```
fundo da página   neutral-50   #fafaf8   ← mais claro
trilho            neutral-100  #f5f4f1   ← um degrau abaixo
cartões           surface      #ffffff   ← mais claro que os dois, flutua
```

| Token | Claro | Papel |
|---|---|---|
| `rail` | neutral-100 | fundo do trilho |
| `rail-border` | neutral-200 | borda direita e divisórias |
| `rail-foreground` | neutral-800 | item em hover, logo (11.2:1) |
| `rail-foreground-muted` | neutral-600 | item em repouso, rótulo de seção (5.2:1) |
| `rail-foreground-subtle` | neutral-500 | item desabilitado (3.5:1) |
| `rail-hover` | neutral-200 | fundo do item sob o ponteiro |
| `rail-active-bg` / `-fg` | accent-100 / accent-800 | item ativo (7.8:1) |

**Nunca use `text-white` ou `bg-white/10` dentro da sidebar.** Branco fixo só
funciona sobre fundo escuro — era exatamente isso que prendia o trilho ao visual
escuro e impedia o tema de clareá-lo sem quebrar a legibilidade. Só o tema
escuro escurece o trilho, sobrescrevendo os tokens acima.

### Tema escuro

Preparado, **não ativado**. Os valores vivem em `[data-theme="dark"]` no
`globals.css`, com **hex literais** — não `var()`. Isso é deliberado: aquele
bloco é CSS cru que o Tailwind não inspeciona ao decidir quais variáveis emitir;
se referenciasse `var(--color-neutral-800)` e nenhuma classe do app usasse esse
degrau, o tree-shaking removeria a variável e o tema escuro quebraria em
silêncio.

Ativar exige migrar as telas que ainda usam `bg-white`/`text-gray-900` fixos.
É uma frente própria.

---

## 5. Regras de uso

### Hierarquia de botão

Uma só ação primária por tela. Dois primários lado a lado significa que um
deveria ser `secondary`.

```tsx
<Button>Salvar</Button>                        // accent-600 chapado
<Button variant="secondary">Cancelar</Button>  // superfície + borda
<Button variant="ghost" size="icon">…</Button> // sem peso até o hover
<Button variant="destructive">Excluir</Button> // vermelho só no hover
```

Ação primária é **`accent-600`**, nunca preenchimento grafite. `bg-brand-navy` e
`bg-neutral-900` como fundo de botão são o padrão ANTIGO — deixavam duas
linguagens de primário convivendo e faziam o tema claro parecer escuro. Estado
selecionado (aba, pill, filtro) segue a mesma regra.

### Sem gradiente na UI

Degradê em botão, cartão ou barra é o que mais envelhece uma interface. A
profundidade aqui vem de **borda + sombra baixíssima**. O único gradiente
permitido é `onBrandHeroGradientClass`, na capa do portal, onde a função é
atmosfera e não hierarquia.

### Sombras

Tingidas de quente (`oklch(0.24 0.01 100)`), nunca de preto puro — sombra
neutra-fria sobre fundo creme suja a cor. Opacidades entre 4% e 11%: no repouso
o cartão é praticamente plano e só sobe sob o ponteiro.

### Acessibilidade

- Texto normal ≥ 4.5:1, texto grande/ícone ≥ 3:1.
- Preenchimento com texto branco: degrau **600**, nunca 500.
- Foco: a regra global `:focus-visible` já aplica contorno `accent-500` com
  offset. Não desligue com `outline-none` sem repor algo equivalente.
- `prefers-reduced-motion` é respeitado globalmente.

---

## 6. Armadilhas conhecidas

### `overflow-x: clip`, nunca `hidden`

```css
html, body { overflow-x: clip; }   /* ✅ */
html, body { overflow-x: hidden; } /* ❌ quebra TODO position:sticky do app */
```

Pela CSS Overflow 3 §3, `overflow-x: hidden` com `overflow-y: visible` força o
eixo Y para `auto`. O `<body>` vira scroll container e todo `position: sticky`
passa a se ancorar nele em vez da viewport — ou seja, **para de grudar**. Era o
que fazia a sidebar rolar para fora da tela e expor o fundo branco.

`clip` corta o transbordo horizontal sem criar scroll container.

Também foi removido o `max-width: 100vw` que existia junto: `100vw` **inclui** a
largura da barra de rolagem, então ele mesmo causava ~15px de transbordo
horizontal no Windows — exatamente o problema que dizia resolver.

### Cores de pasta

Em [`src/lib/folderColors.ts`](src/lib/folderColors.ts). São os únicos hex
"soltos" legítimos da UI, porque o valor é escolhido pelo usuário e persistido
por pasta no banco.

Pastas criadas antes da virada guardam a paleta saturada antiga. A tradução
acontece na **leitura** (`resolveFolderColor`), não por migração de banco:
reescrever a coluna perderia a escolha original e não teria volta.

### PDF da proposta

[`src/services/pdf/proposal/theme.ts`](src/services/pdf/proposal/theme.ts)
**diverge do sistema de propósito** e mantém o navy/azul antigos. As cores foram
amostradas das propostas físicas de referência (Andora 287.1, Maxif4 163.4).
Alinhá-lo à paleta nova faria as propostas futuras destoarem de todo o histórico
comercial já enviado a clientes — é decisão de marca, não de código.

---

## 7. Tipografia

Stack de sistema afinada, sem requisição externa nem FOUT: prefere Inter quando
instalada, cai em Segoe UI / SF Pro.

Trocar por webfont é uma linha em `--font-sans` mais o `next/font` no layout:

```ts
import { Inter } from "next/font/google";
const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
```

Números de tabela usam `tabular-nums` automaticamente (`table` e `[data-tabular]`)
— colunas de valores alinham por dígito, o que importa numa tela de orçamento.

---

## 8. Manutenção

A paleta é **gerada**, não editada à mão. O script que produz as rampas e valida
gamut + contraste está no scratchpad da sessão que criou este documento; a saída
é o bloco `@theme` do `globals.css`. Ao mexer numa rampa:

1. Regenere em OKLCH (mantenha a curva de croma em sino).
2. Confira gamut sRGB e o contraste do degrau 600.
3. Atualize `globals.css`, `branding.ts` e o bloco `[data-theme="dark"]`.

Para medir drift visual (hex e valores arbitrários fora do sistema):

```bash
node ~/.claude/skills/identidade-visual/scripts/auditar_cores.mjs src
```
