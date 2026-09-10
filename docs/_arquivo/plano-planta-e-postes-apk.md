# Planta e Postes no APK: diagnóstico e plano de refação

> Documento de decisão. Escrito em 2 set 2026, a partir de leitura de código nos dois lados
> (web `OrcaRede` e `ApkOrcaRede`) e das fontes da biblioteca nativa de PDF.
> Complementa `docs/andamento-obra-decisoes-arquitetura.md` (14 ago 2026), que registrou que o
> caminho de campo nunca rodou contra dado real. Este documento trata da tela onde esse caminho
> começa: a planta.

**Status:** Fase 0 implementada em 3 set 2026, pendente de validação em aparelho. Fases 1 e 2
aguardando as duas decisões da seção 6 e as medições da Fase 0.5.
**Escopo:** tela `Planta` do APK (`app/(main)/obra/[workId]/postes.tsx`) e o que ela precisa do import
no web (`createWorkFromBudget`).

---

## 1. O sintoma relatado e o que ele esconde

O relato de campo foi: a planta fica nítida até certa altura e borra dali pra baixo; o toque não
captura direito; o poste não aparece como deveria; o zoom se comporta de forma estranha.

São quatro sintomas e cinco causas distintas. Nenhuma delas é "a planta está errada". O desenho da
tela está certo no conceito (viewport próprio, pinos como desenho puro, decisão do toque
centralizada). O que está errado é a execução em cinco pontos independentes, listados abaixo em
ordem de impacto.

---

## 2. Diagnóstico

### 2.1. Os pinos são desenhados 4× menores do que deveriam

**Este é o defeito de maior impacto e o mais barato de corrigir.**

`PolePin` contra-escala o pino para ele não engordar com o zoom
(`ApkOrcaRede/src/components/obra/PolePin.tsx:35-37`):

```ts
const counter = useAnimatedStyle(() => ({
  transform: [{ scale: fitScale / scale.value }],
}));
```

O pino vive dentro da view de conteúdo, que já está escalada por `scale`. Então o tamanho final
em pixel de tela é:

```
tamanho_na_tela = size × (fitScale / scale) × scale = size × fitScale
```

O `scale` se cancela, e sobra `fitScale` como multiplicador fixo. E `fitScale`
(`postes.tsx:165-168`) é no máximo `viewport.width / contentW`, que por construção é
`1 / PLAN_RENDER_SCALE` = **0,25**.

Resultado: o pino de poste instalado, declarado com 22 px, é desenhado com **5,5 px** na tela. O de
poste planejado, declarado com 14, vira **3,5 px**. O anel de seleção de 54 vira 13,5.

O comentário no código explica a intenção ("em zoom 10× um pino de 22 px viraria 220 px"), e a
intenção está certa. O erro é que o autor tratou `scale.value` como zoom relativo ao encaixe,
quando ele é a escala absoluta. A contra-escala correta é `1 / scale.value`.

Efeito colateral que explica metade da confusão do toque: o raio de acerto
(`postes.tsx:242`) está calculado certo, em 26 px de tela. Ou seja, **a área sensível tem 26 px e o
desenho tem 5,5**. O gerente toca no que parece vazio e seleciona um poste; toca no poste e às
vezes acerta o vizinho. Em trecho de rua com postes próximos, no zoom de abertura, tudo cai dentro
de 26 px de algum poste, então **criar um poste novo fica impossível** e nada acontece no dedo.

### 2.2. O zoom se reseta sozinho

`PlanViewport` reenquadra a planta num `useEffect`
(`ApkOrcaRede/src/components/obra/PlanViewport.tsx:109-115`):

```ts
useEffect(() => {
  fitScale.value = fit;
  maxScale.value = fit * MAX_ZOOM;
  scale.value = abertura.s;
  tx.value = abertura.x;
  ty.value = abertura.y;
}, [fit, abertura, fitScale, maxScale, scale, tx, ty]);
```

`abertura` depende de `initialFocus`, que depende de `content`, `frame`, `planned` e `installed`.
Qualquer um desses mudar de identidade joga o zoom e o pan de volta ao enquadramento de abertura.
Na prática isso acontece:

- quando `marksQuery.refetch()` roda depois de salvar um poste (`postes.tsx:433`). O gerente
  marca um poste com zoom no trecho, e a planta pula de volta pro enquadramento geral;
- quando a faixa de "planta guardada" (`staleStrip`) aparece ou some, porque muda a altura medida
  do `pdfBox` e portanto `viewport`;
- a cada `onLoadComplete` do PDF, pelo motivo da seção 2.3.

Um viewport não pode ter o enquadramento inicial como efeito reativo. Enquadrar é um evento
("abriu a tela"), não um estado derivado.

### 2.3. `setPageSize` sem guarda, realimentando o layout

`postes.tsx:353-355`:

```ts
onLoadComplete={(_pages, _path, size) => {
  if (size?.width && size?.height) setPageSize({ width: size.width, height: size.height });
}}
```

Cria objeto novo sempre, mesmo com os mesmos números. `pageSize` alimenta `content`, que alimenta
o `style` do próprio `<Pdf>`, que ao mudar de tamanho dispara `onLoadComplete` de novo. O ciclo
converge (duas rodadas), mas cada rodada passa pelo efeito da seção 2.2 e reseta o zoom. Compare
com `setViewport` logo acima (`postes.tsx:320-325`), que **tem** a guarda de igualdade. É
inconsistência dentro do mesmo arquivo.

### 2.4. `pageSize` no Android não é o que o código assume

`planFrame` (`ApkOrcaRede/src/lib/plan/coords.ts:43-69`) espera receber o tamanho **natural** da
página, em pontos, porque replica `calculatePdfPageDimensions` do web
(`src/lib/canvas/pdfRenderConfig.ts:40-64`), que recebe `page.originalWidth` do react-pdf.

Mas no Android o `react-native-pdf` emite outra coisa
(`node_modules/react-native-pdf/android/src/main/java/org/wonday/pdf/PdfView.java:152-162`):

```java
public void loadComplete(int numberOfPages) {
    SizeF pageSize = getPageSize(0);
    float width = pageSize.getWidth();
    ...
}
```

`getPageSize` do AndroidPdfViewer devolve a página **já escalada para a largura da view**, em
pixels. Ou seja, o APK alimenta `planFrame` com pixels da view, e o web alimenta com pontos do PDF.

Hoje isso não quebra por dois acidentes:

- na `render_version 2` (default de todo import novo, `src/actions/works.ts:473`) só a **proporção**
  importa, e a proporção sobrevive ao reescalonamento;
- na `render_version 1` a fórmula é `clamp(1200 / max(largura, altura), 2, 4)`, e qualquer prancha
  real tem lado maior que 600 pontos, então o resultado prende no piso 2 nas duas leituras.

> **Correção de 3 set 2026. Eu disse que era latente. É ativo.**
>
> A primeira redação afirmava que a `render_version 1` se salvava porque "a fórmula prende no piso
> 2 nas duas leituras". O clamp prende, sim, mas o **2 multiplica bases diferentes**: o web
> multiplica 1684 (pontos), o APK multiplica ~2802 (pixels da view). Mesmo fator, resultado
> diferente. Ver a medição completa em 2.8.
>
> Continua verdade que a `render_version 2` é imune, porque nela só a proporção importa.

### 2.5. O borrão: o teto do renderizador

O `react-native-pdf` 7.0.4 usa o AndroidPdfViewer (`android/build.gradle:144`:
`com.github.zacharee:AndroidPdfViewer:4.0.1`). Essa biblioteca não rasteriza a página inteira: corta
em ladrilhos e mantém no máximo **120** deles. Constantes (públicas e mutáveis):

| Constante | Valor |
| --- | --- |
| `Constants.PART_SIZE` | 256 |
| `Constants.Cache.CACHE_SIZE` | 120 |
| `Constants.THUMBNAIL_RATIO` | 0.3 |

A tela pede a planta a 4× a largura do viewport (`postes.tsx:30`, `PLAN_RENDER_SCALE = 4`),
justamente para sobrar pixel no zoom. Numa tela de ~374 dp com densidade 3, isso dá cerca de
4.500 × 3.200 px, ou seja **18 × 13 = 234 ladrilhos** para um cache de 120.

Os ladrilhos são gerados linha por linha, de cima pra baixo. Quando o cache enche, o
`CacheManager` descarta os **mais antigos**. O que é despejado cai para o *thumbnail*, que é a
página inteira renderizada a 0,3 do tamanho e esticada de volta.

> **Correção de 3 set 2026, medida em emulador.** A primeira redação deste documento dizia que o
> carregamento *parava* ao atingir o limite, e que portanto o borrão ficava **embaixo**. Está
> errado: a página inteira chega a ser desenhada, e sobrevivem os **últimos** 120 ladrilhos. O
> borrão fica **em cima**. Ver a medição M1 na seção 8.1. O mecanismo (ladrilho de 256, cache de
> 120, ordem linha a linha) está confirmado; só a direção estava invertida.

Como o zoom da tela é transformada em JS e o `<Pdf>` fica travado em `scale={1}`, a divisa está
gravada no bitmap: ampliar não resolve, só amplia a divisa junto.

**Este é um teto, não um bug.** Aumentar `PLAN_RENDER_SCALE` piora. Diminuir para caber nos 120
ladrilhos (o limite fica em torno de 2,8×) deixa a planta uniformemente nítida, mas devolve parte
do borrão no zoom, que é o problema que o 4× foi criado para resolver. A biblioteca também não
expõe API de pan, então não dá para deixar ela mesma cuidar do ladrilhamento (que é exatamente o
que ela sabe fazer bem) sem perder o controle da posição, que os pinos precisam.

### 2.6. Composição de gestos hostil ao dedo com luva

`PlanViewport.tsx:185-199`:

```ts
const singleTap = Gesture.Tap().numberOfTaps(1).maxDuration(280)...
const composed = Gesture.Exclusive(doubleTap, singleTap, Gesture.Simultaneous(pinch, pan));
```

Dois problemas:

- `maxDuration(280)`: um toque deliberado, demorado, com luva, falha. E como `Exclusive` põe o
  pan/pinça em terceiro lugar, o dedo parado por 300 ms não vira nem toque nem arraste. Não
  acontece nada, que é literalmente o relato;
- o toque simples só vale depois do duplo falhar, então há sempre uma latência de até 260 ms entre
  encostar e a resposta. Somado ao pino de 5,5 px, a tela parece não responder.

---

### 2.7. Falha de leitura desenhada como "nenhum poste" (achado de 3 set 2026, em campo)

Encontrado durante o teste do Paulo em aparelho real, com o servidor fora do ar. Ele marcou um
poste, a tela voltou com **"0 de 9 postes"** e a planta sem nenhuma marcação verde.

Nada tinha sido perdido: conferido direto no Postgres de dev, a obra tinha os **6 postes
`installed`**, incluindo o `p14` recém-criado. O problema era só de leitura, e do que a tela fazia
com uma leitura falha:

```ts
// postes.tsx, fetchPlanMarks, antes
return {
  installed: (installed.data ?? []) as WorkPoleInstallation[],
  planned: (planned.data ?? []) as WorkProjectPost[],
};
```

Sem tratar `error`, qualquer falha (rede, RLS, token expirado) vira `[]`. As consequências se
empilham:

1. O React Query considera **sucesso**, então não tenta de novo e ainda **guarda o zero em cache**.
2. O cabeçalho afirma uma contagem falsa com toda a confiança: "0 de 9 postes".
3. Não sobra registro nenhum do erro, então nem dá para saber depois o que falhou. Foi exatamente
   por isso que não foi possível determinar qual das duas consultas caiu.

Gravidade: alta, e não é sobre pixel. Num app cujo argumento é "grava no aparelho e envia sozinho",
mostrar o trabalho do dia zerado destrói a confiança do gerente na ferramenta. Ele vai marcar tudo
de novo, ou vai parar de usar.

**Assimetria que explica o buraco:** a planta em PDF tem cache offline, versionamento e faixa de
aviso (`pdf-cache.ts`). As marcações não têm nada disso: nem cache, nem estado de erro, nem aviso.
Sem sinal, a planta abre e os postes somem.

Corrigido na Fase 0 (item 6): a consulta lança em vez de engolir, o React Query mantém o último
resultado bom, o cabeçalho para de afirmar contagem que não tem, e entra uma faixa tocável de
"tentar de novo". **O conserto de raiz é cachear as marcações no aparelho, como o PDF já é**, e
está na Fase 1.

### 2.8. O poste marcado em campo cai no lugar errado no portal (achado de 3 set 2026)

**Este é o defeito mais grave do conjunto, e não tem nada a ver com pixel.**

Investigado a partir do PDF real da obra "Loteamento Sol Poente", puxado do sandbox do aparelho
(`adb run-as`) e inspecionado direto.

**A página é rotacionada:**

```
MediaBox: 0 0 1191 1684     (retrato, A2)
/Rotate 270                 (exibida em paisagem, 1684 × 1191)
```

**O web trata isso certo, e é consistente consigo mesmo.** `originalWidth` do react-pdf é
`page.getViewport({scale: 1}).width` (`node_modules/react-pdf/dist/shared/utils.js:96-105`), e o
`getViewport` do pdf.js aplica a rotação por padrão. Então o web recebe 1684 × 1191 (paisagem), o
mesmo que o `CanvasVisual` usa quando o engenheiro posiciona os postes. Sem divergência entre os
dois canvas do web.

**O APK não.** Recebe do `onLoadComplete` do Android o tamanho em pixels da view (bug 2.4), e
alimenta a mesma fórmula com uma base 1,66× maior:

| | base | fator V1 | quadro resultante | canto sup. esq. |
| --- | --- | --- | --- | --- |
| Web | 1684 × 1191 **pontos** | 2 | 3368 × 2382 | (1316, 1809) |
| APK | ~2802 × 1981 **pixels da view** | 2 | 5604 × 3962 | (198, 1019) |

O clamp prende em 2 nos dois casos. Isso foi o que me enganou na primeira leitura. Mas o 2
multiplica bases diferentes, então os quadros divergem em 66%.

**O que isso custa, calculado:**

| Gerente toca em | Engenheiro vê em | Erro |
| --- | --- | --- |
| centro (0,50, 0,50) | (0,50, 0,50) | zero |
| (0,40, 0,40) | (0,33, 0,33) | 7% |
| (0,30, 0,30) | (0,17, 0,17) | 13% |
| (0,25, 0,55) | (0,08, 0,58) | 17% |

O centro bate exato e o erro cresce com a distância dele, que é precisamente o que o comentário em
`coords.ts` já avisava que aconteceria se os dois lados divergissem.

**Traduzindo para o canteiro:** a prancha tem 1684 pt de largura, ou 59,4 cm, e o desenho está em
**1:1000**. Então a largura útil da planta é de cerca de **594 m de rua**. Um erro de 13% é
**77 metros**. Um poste marcado na ponta do trecho pode aparecer quase um quarteirão fora do lugar
no portal do engenheiro.

**Dos 6 postes já gravados nesta obra, 1 cai fora da planta** quando relido pelo quadro do web
(o `p1` em (1607, 4353) vira (0,09, 1,07), ou seja abaixo da borda inferior).

**Alcance:** só `render_version 1`. A `render_version 2` é imune porque só usa a proporção, e é o
default de todo import novo (`src/actions/works.ts:473`, `budget.renderVersion ?? 2`). Ou seja,
atinge as obras legadas, que são justamente as que já existem.

**Ponto em aberto, com evidência mas sem prova.** Sobrepondo os 9 postes de projeto no PDF
renderizado, mesmo usando o quadro correto do web eles não caem sobre os símbolos de poste
desenhados na prancha, e o caminho deles sobe da esquerda para a direita enquanto a rua desce. É um
espelhamento em Y. Duas explicações possíveis, e não dá para escolher daqui:

1. o `/Rotate 270` é maltratado em algum ponto do import, ou
2. o engenheiro posiciona os ícones de poste no orçamento de forma aproximada, sem encostar nos
   símbolos do desenho, e aí não há nada errado.

**Resolve em 30 segundos:** abrir esta obra no portal e olhar se os postes caem sobre a rua. Se
caírem, é a explicação 2 e não há mais nada a fazer. Se não caírem, tem um terceiro bug de
coordenada, anterior a tudo isto.

**Correção.** Não tem conserto bom dentro do APK: o Android simplesmente não entrega o tamanho da
página em pontos, e depender de ler o MediaBox do arquivo é frágil. O conserto é o item 6 da
Fase 1, gravar a geometria no snapshot no momento do import, que era um item de limpeza e passa a
ser **bloqueador de correção**. Enquanto ele não chega, obras em `render_version 1` têm coordenada
não confiável no APK.

### 2.9. O poste marcado não aparece até sair e voltar da tela (achado de 3 set 2026, reproduzido ao vivo)

Reproduzido em emulador com o Paulo marcando o poste `p15`. Sintoma: o pino não aparece e o
cabeçalho continua em "6 de 9 postes".

**Gravar funcionou perfeitamente.** Verificado nas três camadas, tudo no mesmo segundo:

| Camada | Estado |
| --- | --- |
| outbox local | `record_pole_installation` · **synced** · 0 tentativas · 17:32:42 |
| `work_pole_installations` | `be1d2124…` · `p15` · (2556, 3643) · 17:32:43 |
| storage | foto de 16.644 bytes · 17:32:42 |

Primeira tentativa, sem erro. O problema não é gravar: é a tela **saber** que gravou.

**A causa.** Em `NovoPosteSheet.tsx`:

```ts
await enqueue({ ... });   // grava só no outbox LOCAL
onSaved();                // → marksQuery.refetch(), imediatamente
```

O `enqueue` não fala com o servidor; quem envia é o worker de sincronização, segundos depois. O
`refetch` disparado nesse instante chega ao servidor **antes do poste** e volta com a lista velha.
Dois segundos depois o worker envia com sucesso, e **nada avisa a tela**.

O único `invalidateQueries` do app está em `useNetworkStatus.ts:45` e só dispara quando a conexão
**cai e volta**. Com sinal o tempo todo ele nunca roda. Resultado: o poste só aparece quando o
gerente sai da tela e entra de novo.

É determinístico, não intermitente. E sem sinal seria pior: o `refetch` nem completaria, então o
pino não apareceria de jeito nenhum até haver rede — num app cuja premissa é funcionar sem ela.

**Correção, em duas metades:**

1. **O pino aparece na hora.** `onSaved` passa a receber o poste recém-criado e inseri-lo direto no
   cache do React Query (`setQueryData`), a partir do que o aparelho já gravou. Funciona com zero
   sinal, que é o caso que importa.
2. **A tela reconcilia quando o envio confirma.** A tela assina o `outboxEmitter`, que já existia e
   já emitia no `markSynced`, e invalida a consulta. O poste provisório (sem `created_by`, sem
   mídias) é trocado pelo de verdade.

**Validado ao vivo:** depois da correção, "7 de 9 postes" e os sete pinos desenhados na planta.

### 2.10. Retentativa de foto trava para sempre: falta política de UPDATE no bucket

Encontrado ao investigar dois postes parados na fila **há 5 dias**, com erro
`Signed URL failed: The resource already exists`.

**O mecanismo.** `uploadMedia` (`src/lib/supabase/storage.ts`) chamava
`createSignedUploadUrl(path)` sem `upsert`. Essa chamada **reserva o caminho** no Storage. Se a
rede cair depois disso — upload feito, mas o RPC ou a marcação local de "enviado" não confirma — o
item volta para a fila. Na retentativa ele pede URL assinada para o **mesmo caminho**, e sem
`upsert` o Storage recusa com "already exists". Toda tentativa seguinte bate na mesma parede até
esgotar as 5 e virar "falhou", cuja única saída na tela é **Descartar**.

**O que já foi corrigido:** `createSignedUploadUrl(path, { upsert: true })`. A biblioteca documenta
que `uploadToSignedUrl` não tem opção de upsert própria, ela só vale na hora de pedir a URL.

**O que ainda bloqueia, e precisa de decisão.** Com upsert, o erro mudou para:

```
new row violates row-level security policy
```

O bucket `andamento-obra` tem política de **INSERT** para cada tipo (`pole-installations`, `chat`,
`daily-logs`, `milestones`, `checklists`, `alerts`) e uma de **SELECT** para o bucket inteiro. Não
tem **nenhuma política de UPDATE**. Como o objeto já existe, o upsert vira UPDATE e é barrado.
Outros buckets do sistema (`company-assets`, `proposal-media`) têm UPDATE; este não.

Opções:

- **A. Criar a política de UPDATE**, com o mesmo predicado das de INSERT (`work_members` + papel
  `manager` + pasta batendo com o `work_id`). Não amplia alcance: é exatamente quem já pode
  escrever ali. Corrige de raiz, inclusive o caso do arquivo meio enviado, que precisa ser
  sobrescrito.
- **B. Não reenviar se o arquivo já estiver lá.** Não mexe em permissão e economiza banda no
  canteiro, mas deixa um upload incompleto quebrado para sempre, apontando para uma foto vazia.

Recomendo **A**, com **B** depois como economia de banda. É mudança de política de acesso, então
fica aguardando decisão.

**Nota importante sobre os dois postes presos:** eles **já estavam gravados no servidor** desde
02/09, com as fotos completas no storage (15.282 e 15.876 bytes). Os itens na fila eram duplicatas
de trabalho já salvo. Ou seja, **"Descartar" neles é seguro e não perde nada** — o contrário do que
eu havia afirmado antes de conferir.

---

## 3. O que não pode mudar: o contrato de coordenadas

Antes de propor qualquer refação, vale fixar o que é intocável, porque é o que faz o poste marcado
em campo cair no lugar certo no portal.

- Todo poste vive num quadro lógico de **6000 × 6000** (`docs/apk-contracts/06-pole-installations.md`,
  `POLE_LIMITS.LOGICAL_GRID_SIZE`). O servidor valida 0..6000.
- A planta ocupa um retângulo **centralizado em (3000, 3000)** dentro desse quadro
  (`WorkCanvas.tsx:437-448`, `top/left` no centro com `translate(-50%, -50%)`).
- O tamanho desse retângulo sai de `calculatePdfPageDimensions`
  (`src/lib/canvas/pdfRenderConfig.ts:40-64`): na V2, largura 6000 e altura proporcional; na V1,
  a página multiplicada por um fator preso entre 2 e 4.
- No import, postes de planta em PDF entram **sem transformação** (`src/actions/works.ts:562-567`);
  só plantas raster passam por `computeRasterCoordTransform`.

O `planFrame` do APK (`coords.ts:43-69`) existe só para reconstituir esse retângulo do lado de cá,
a partir do tamanho da página. **A proposta abaixo elimina essa reconstituição**, que é a origem do
problema 2.4: em vez de o APK adivinhar a geometria, o import grava a geometria.

---

## 4. Opções de renderização pesquisadas

| # | Abordagem | Nítido no zoom | Offline | Custo | Veredito |
| --- | --- | --- | --- | --- | --- |
| A | Manter `react-native-pdf`, subir `Constants.Cache.CACHE_SIZE` via `patch-package` | até 4× | sim | baixo | paliativo válido |
| B | Módulo Expo próprio sobre `android.graphics.pdf.PdfRenderer`, gerando ladrilhos no aparelho | sem teto | sim | alto | só Android, módulo nativo novo |
| C | **Pirâmide de ladrilhos gerada no import, baixada pelo APK** | sem teto | sim | médio | **recomendado** |
| D | Uma imagem única de alta resolução com `<Image>` | não | sim | baixo | 6000 px decodificado passa de 100 MB; o Fresco reduz para o tamanho da view e o borrão volta |
| E | WebView com pdf.js ou Leaflet | sim | complicado | alto | ponte de gestos e ciclo de vida offline; troca um problema por três |
| F | `react-native-skia` | parcial | sim | alto | não lê PDF (o backend PDF do Skia é de escrita) e continua preso ao limite de textura |
| G | Trocar por `react-native-pdf-light`, mantendo nosso viewport | até o teto do bitmap | sim | baixo | **intermediário real, ver 4.2** |

### 4.1. O que a pesquisa confirmou

- **A arquitetura de pirâmide é prática corrente, não invenção.** O
  [plugin de tiling do EmbedPDF](https://www.embedpdf.com/docs/react/headless/plugins/plugin-tiling)
  faz exatamente o desenho proposto aqui, em produção: camada de base em baixa resolução mais
  ladrilhos de alta só para o que está visível. Ladrilho padrão de 768 px.
- **O pdf.js não sabe ladrilhar sozinho.** Ele renderiza a página inteira num canvas único
  ([guia da Apryse](https://apryse.com/blog/pdf-js/guide-to-pdf-js-rendering)), que é a razão de
  todo mundo que precisa de zoom profundo ter que construir a pirâmide por fora.
- **O teto do bitmap único é real e conhecido.** O
  [`react-native-pdf-renderer`](https://github.com/douglasjunior/react-native-pdf-renderer) tem uma
  prop `maxPageResolution` com default **2048 px**, documentada como "definida para evitar o crash
  do Android ao dar zoom demais". O erro que ela evita é o
  [`Canvas: trying to draw too large bitmap`](https://github.com/douglasjunior/react-native-pdf-renderer/issues/26).
  Nosso 4× pede 4.488 px, mais que o dobro desse teto. Confirma que a seção 2.5 não é um detalhe
  de configuração: é o limite da abordagem.

### 4.2. O que a pesquisa mudou

Três coisas. Duas corrigem o plano, uma corrige um erro meu.

**a) Não ladrilhar com o pdf.js. Renderizar uma vez e fatiar.**

O plano original mandava gerar cada ladrilho com uma chamada de `page.render` numa sub-região. Só
que a
[discussão 19600 do mozilla/pdf.js](https://github.com/mozilla/pdf.js/discussions/19600), que
pergunta exatamente se o pdf.js descarta o que cai fora do canvas ao renderizar um ladrilho, está
**sem resposta**. Ou seja, não se sabe se 108 ladrilhos custam 108 passadas de página inteira. Se
custarem, um import levaria minutos.

O caminho seguro contorna a dúvida inteira: renderizar a página **uma vez** a 6000 px, que é o que
o `CanvasVisual` já faz hoje na `render_version 2`, e fatiar esse canvas com `drawImage`, que é
quase de graça. A dúvida sobre culling deixa de importar.

**b) Emenda entre ladrilhos existe e eu não tinha previsto.**

O EmbedPDF usa `overlapPx: 2.5` por padrão para não aparecer fio branco entre ladrilhos. Sem isso,
o arredondamento de posição em zoom fracionário deixa costura visível. Entra no plano: cada
ladrilho carrega alguns pixels de sobreposição.

**c) Limite de canvas do navegador, que muda a escolha da seção 6.1 e revela um bug provável no web de hoje.**

| Navegador | Área máxima de canvas |
| --- | --- |
| Chrome | 268.435.456 px |
| Firefox | 472.907.776 px |
| Safari desktop | **16.777.216 px** |
| Safari iOS | 4.096 × 4.096 |

Uma prancha A1 paisagem a 6000 px de largura dá 6000 × 4238 = **25,4 milhões de pixels**. Passa
folgado no Chrome e no Firefox. **Não passa no Safari.**

Duas consequências:

1. Gerar os ladrilhos no navegador do engenheiro só é confiável no Chrome ou Firefox. Se ele usa
   Safari, precisa ser no servidor.
2. Mais sério: o `CanvasVisual` **já renderiza a 6000 px hoje** (`CanvasVisual.tsx:354-375`). Se
   isso está certo, o canvas do orçamento já falha no Safari para qualquer prancha grande em
   `render_version 2`. É uma previsão verificável em cinco minutos: abrir um orçamento com prancha
   A1 no Safari e ver se a planta aparece.

### 4.3. A opção G, que eu não conhecia antes de pesquisar

Existe o [`react-native-pdf-light`](https://github.com/alpha0010/react-native-pdf-viewer)
(npm `react-native-pdf-light`, v3.2.1, publicado em mai/2026). Verifiquei o pacote no registro: tem
`codegenConfig` com `componentProvider`, então é compatível com a Nova Arquitetura, que é obrigatória
no RN 0.83 que o projeto usa.

O que ele tem de diferente do `react-native-pdf`:

- `<PdfView>` é um renderizador **burro**: você dá um tamanho, ele desenha a página naquele tamanho.
  Não tem gesto próprio, não tem cache de 120 ladrilhos, não tem divisa horizontal. Encaixa no
  nosso viewport, que é justamente o que a tela quer;
- usa `android.graphics.pdf.PdfRenderer` no Android e `CGPDFDocument` no iOS;
- `PdfUtil.getPageSizes()` devolve o tamanho **natural** da página por chamada de utilitário, não
  por callback de render. Isso **mata o bug 2.4** e faz Android e iOS concordarem.

O teto dele deixa de ser o cache de ladrilhos e passa a ser o tamanho do bitmap, que pela evidência
do `maxPageResolution` fica perto de 2048 px com segurança e é arriscado nos 4.488 px que a tela
pede hoje.

**Onde isso entra:** é um degrau intermediário legítimo, mas troca um teto por outro. Só vale se a
medição da Fase 0.5 mostrar que a Fase 2 vai demorar. Não substitui a pirâmide.

### 4.4. Por que a C

1. **Tira o PDF do aparelho.** Some o `react-native-pdf` da tela de planta, some o AndroidPdfViewer,
   some o limite de 120 ladrilhos, some a divergência Android/iOS do `getPageSize` (2.4).
2. **O caminho já existe.** `derivePlanKind`
   (`src/app/tools/andamento-obra/obras/[workId]/visao-geral/page.tsx:129-133`) já distingue planta
   PDF de planta raster, e o `WorkCanvas` já renderiza as duas. O import já sabe copiar imagem e já
   normaliza coordenada de raster (`src/actions/works.ts:437-468`).
3. **O pdf.js já roda no navegador do engenheiro**, em 6000 px de largura, na
   `render_version 2` (`CanvasVisual.tsx:354-375`). Gerar os ladrilhos é o mesmo `page.render` num
   canvas por ladrilho, mais `canvas.toBlob('image/webp')`. Zero dependência nova.
4. **Memória.** O APK decodifica só os 10 a 15 ladrilhos visíveis, não a planta inteira.
5. **Um invariante limpo:** o nível de detalhe máximo da pirâmide é exatamente o quadro lógico de
   6000. **Um pixel do nível máximo é uma unidade lógica.** A conversão coordenada→tela deixa de ter
   caso especial de V1/V2 e vira uma multiplicação.

### 4.5. O que a C custa

- Storage: estimativa de 2 a 6 MB por obra (prancha de rede é traço fino sobre branco, comprime
  muito bem em WebP). Contra o PDF, que já é guardado hoje.
- O import fica alguns segundos mais lento.
- As 5 obras já importadas precisam de um backfill.
- Se o ladrilhamento acontecer no navegador, depende da máquina do engenheiro (ver seção 6).

---

## 5. Desenho proposto da tela

### 5.1. Camada de planta: `PlanTiles`

Dois níveis:

- **z0, visão geral.** Uma imagem de ~1024 px de largura cobrindo a planta inteira. Sempre montada,
  sempre no fundo. Garante que nunca existe buraco branco enquanto os ladrilhos carregam.
- **z1, detalhe.** Ladrilhos cobrindo a planta a 6000 px de largura, com **sobreposição de 3 px**
  em cada borda para não aparecer costura no zoom fracionário (o EmbedPDF usa 2,5 px por padrão pelo
  mesmo motivo). Com ladrilho de 512 px, uma A1 paisagem dá 12 × 9, cerca de 108 arquivos. O
  EmbedPDF usa 768 por padrão, o que daria 8 × 6 = 48; qual dos dois fica melhor é uma das medições
  da Fase 0.5.

O componente calcula quais ladrilhos intersectam o retângulo visível no zoom atual e monta só
esses, com `<Image>` posicionado em coordenada de conteúdo. Reage ao pan/zoom com throttle
(reagir a cada frame de gesto é desperdício; a cada 100 ms basta, com o z0 cobrindo o intervalo).

Cache em disco na mesma lógica do `pdf-cache.ts` atual, que está bem resolvida: `Paths.document`,
caminho estável por obra, versão conferida contra `render_version`, e cópia antiga servida quando
não há rede. Só muda o conteúdo (N arquivos em vez de 1) e o download passa a ser em lote com
barra de progresso, porque agora é a diferença entre a planta abrir ou não no canteiro.

### 5.2. Geometria vinda do banco, não adivinhada

Gravar no `work_project_snapshot`, no momento do import, o retângulo que a planta ocupa no quadro
lógico e as dimensões da pirâmide:

```
plan_geometry jsonb  -- { width, height, offsetX, offsetY, tileSize, cols, rows, levels }
```

O APK lê e usa. `coords.ts` perde `planFrame` inteiro (a função que hoje reconstitui a geometria a
partir do `pageSize`), e com ele perde o bug 2.4 e a ramificação V1/V2. `logicalToView` e
`viewToLogical` continuam, simplificadas.

### 5.3. Camada de interação: `PlanViewport` revisado

- **Transformada com dono único.** `scale`, `tx`, `ty` só mudam por gesto ou por chamada
  imperativa. O `useEffect` de enquadramento sai; entra um `ref` com `focusOn(rect)` e
  `resetView()`, chamado uma vez na abertura (com trava de "já enquadrei") e pelo botão de
  reenquadrar. Corrige 2.2.
- **Gestos.** `Gesture.Race(Gesture.Simultaneous(pinch, pan), Gesture.Exclusive(doubleTap, singleTap))`,
  com o `maxDuration` do toque simples subindo para 500 ms e distância máxima folgada. Corrige 2.6.
- **`MAX_ZOOM` ancorado no nível z1.** Deixa de ser um 10 arbitrário e passa a ser "até onde o
  ladrilho ainda tem pixel real", calculado da geometria.

### 5.4. Pinos

- Contra-escala `1 / scale.value`, não `fitScale / scale.value`. Corrige 2.1.
- Alvo mínimo de 44 px de tela para o poste instalado, como manda acessibilidade de toque.
- Numeração do poste aparece ao lado do pino acima de um limiar de zoom. Hoje a numeração só existe
  dentro da folha de detalhes, e no campo o gerente precisa dela na planta para conferir contra o
  projeto.
- Poste planejado e poste instalado com formas distintas, não só cores distintas: no sol do
  canteiro, verde e cinza a 5 px são a mesma coisa.

### 5.5. Marcar poste vira um modo explícito

Hoje qualquer toque no vazio abre a folha de novo poste (`postes.tsx:264-265`). Isso é perigoso em
campo e é a razão de o toque parecer ambíguo: um mesmo gesto significa duas coisas.

O redesenho já resolveu isso no papel. `MD/redesenho-apk/NavMap.dc.html` coloca **Poste** como
entrada do botão **Registrar**, com o rótulo "toque na planta", e `Poste.dc.html` mostra a tela de
captura com o título "Toque onde instalou". Ou seja:

- **Modo ver** (padrão): tocar num pino abre o poste. Tocar no vazio não faz nada.
- **Modo marcar** (entrado por Registrar → Poste): a planta ganha uma tarja no topo, o toque
  derruba um pino provisório, o pino pode ser arrastado para ajustar, e um botão confirma. Só então
  abre a `NovoPosteSheet`.

Isso também dá o passo de conferência que hoje não existe: o gerente vê onde o poste caiu **antes**
de gravar.

---

## 6. As duas decisões que preciso de você

### 6.1. Onde os ladrilhos são gerados

- **No navegador do engenheiro, durante o import.** Zero dependência nova, reaproveita o pdf.js que
  já está carregado. O backfill das 5 obras existentes vira um botão "gerar planta do campo" na
  página da obra, que o engenheiro clica uma vez. Contra: depende da máquina dele, e um import de
  prancha grande pode levar de 10 a 30 segundos.
- **No servidor.** Precisa de `pdfjs-dist` + `@napi-rs/canvas` no Node, ou de uma Edge Function.
  Mais robusto e uniforme, backfill vira script. Contra: dependência nova de build e um caminho de
  renderização a mais para manter.

**Recomendo o navegador, com uma condição:** só se o engenheiro usa Chrome ou Firefox. O canvas de
6000 px que a técnica exige passa nos dois com folga e **não passa no Safari**, que corta em 16,7
milhões de pixels contra os 25,4 milhões que uma A1 paisagem pede (tabela em 4.2c). É a medição M4
da Fase 0.5, e ela decide esta seção sozinha.

Se o Safari estiver no caminho, a decisão vira o servidor por obrigação, não por preferência.

### 6.2. Até onde vai a pirâmide

- **z1 = 6000 px** (recomendado): um pixel por unidade lógica, cerca de 108 ladrilhos, zoom útil de
  até ~5×, que já mostra o traço de rua com folga.
- **z2 = 12000 px**: dobra o zoom útil, quadruplica ladrilhos e storage (para ~430 por obra).

**Recomendo o 6000**, pelo invariante limpo com o quadro lógico. Se em campo o gerente pedir mais
aproximação, o z2 pode ser somado depois sem quebrar nada, porque a pirâmide já é versionada por
nível.

---

## 7. Plano de execução

### Fase 0: correções que não dependem de decisão nenhuma — FEITA em 3 set 2026

Tudo JavaScript, sai por `expo-updates` sem build novo.

1. **Feito.** `PolePin`: contra-escala `1 / scale.value`. Disco cheio para instalado, anel vazado
   para planejado (forma, não só cor). Numeração aparece acima de 2,5× o encaixe.
2. **Feito.** `postes.tsx`: guarda de igualdade no `setPageSize`, igual à que já existe no
   `setViewport`. `installed` e `planned` memoizadas, porque alimentam o enquadramento.
3. **Feito.** `PlanViewport`: enquadramento de abertura acontece uma vez, protegido por `ref`, e no
   máximo mais uma se os postes chegarem depois da planta e o gerente ainda não tiver encostado na
   tela. Mudança de geometria reancora a posição em vez de resetar. Botão de reenquadrar
   adicionado. A ideia de expor `focusOn` por ref foi descartada: com o botão dentro do próprio
   viewport, a API imperativa não teria consumidor.
4. **Feito.** `PlanViewport`: `Race` no lugar de `Exclusive`, toque simples com 500 ms e 12 px de
   folga, janela do duplo-toque reduzida de 500 para 220 ms (ela é latência paga em todo toque
   simples).
5. **Feito.** Paliativo do borrão: `planRenderScale()` calcula em runtime o maior fator que cabe no
   orçamento de ladrilhos, em vez do 4 fixo. Alternativa descartada por ora, se a perda de detalhe
   incomodar: `patch-package` subindo `Constants.Cache.CACHE_SIZE`, que mantém o 4× mas exige
   build novo.

6. **Feito.** `fetchPlanMarks` lança em vez de engolir o erro (ver 2.7). Cabeçalho não afirma
   contagem quando não tem, e entra faixa tocável de "tentar de novo". O erro passa a ir para o
   Sentry.

**Furo encontrado durante a implementação.** Enquadrar "uma vez só" quebrava um caso que o efeito
reativo antigo escondia por acidente: antes de o PDF informar o tamanho da página, `content` é
calculado com proporção 1:1 chutada, e a abertura seria gravada em cima da geometria errada, para
nunca mais ser refeita. Resolvido com a prop `ready`: enquanto a geometria é provisória o viewport
encaixa a prancha, mas não gasta a abertura nela.

**Verificação:** `tsc --noEmit` limpo, `eslint` sem avisos nos três arquivos, 120 testes passando.
Nada rodado em aparelho, que é o item M1 da Fase 0.5.

**O que o item 5 custa, medido:**

| Tela | Prancha | Antes (fator 4) | Depois |
| --- | --- | --- | --- |
| 374 dp @3× | A1 paisagem | 234 ladrilhos, cabem 120 | fator 2,7: 108 ladrilhos |
| 374 dp @3× | A4 retrato | 450 ladrilhos, cabem 120 | fator 1,9: 108 ladrilhos |
| 412 dp @3,5× | A1 paisagem | 368 ladrilhos, cabem 120 | fator 2,1: 108 ladrilhos |
| 360 dp @2× | A1 paisagem | 96 ladrilhos, já cabiam | fator 4,0: 96 ladrilhos, sem perda |

Duas leituras saem daí e não estavam no diagnóstico:

- **Prancha retrato é muito pior que paisagem.** 450 ladrilhos para um orçamento de 120 significa
  nítido só no primeiro quarto da altura. Se alguma obra tem prancha retrato, o relato de campo
  seria bem mais severo que o do print.
- **O teto do renderizador é absoluto, não relativo à tela.** 110 ladrilhos de 256 px dão sempre
  cerca de **7,2 megapixels**, seja qual for o aparelho. Repare que o telefone mais denso da tabela
  não ganha nada por ser denso: o fator cai de 2,7 para 2,1 e a planta rasterizada fica com os
  mesmos ~3.030 px de largura. Uma pirâmide a 6000 px tem 25,4 megapixels, ou seja **1,9× mais
  detalhe linear**. É exatamente isso que a Fase 2 compra, e é o número honesto para decidir se ela
  vale.

Critério de pronto, pendente de aparelho: o gerente consegue ver os pinos, tocar num pino e abrir o
poste, dar zoom e o zoom não voltar sozinho.

### Fase 0.5: medir antes de comprometer

Meio dia, descartável, não entra no produto. Existe porque quatro números do plano são estimativa
e não medição, e todos os quatro são capazes de matar a Fase 2 se vierem errados.

| # | Pergunta | Como medir | Mata o plano se |
| --- | --- | --- | --- |
| M1 | A divisa do borrão cai perto da metade da altura? | screenshot da planta no aparelho, medir a proporção | cair em outro lugar: o diagnóstico 2.5 está errado e a causa é outra |
| M2 | Quantos MB fica a pirâmide de uma prancha real? | rodar o ladrilhador num script contra o PDF de uma das 5 obras | passar de ~15 MB: download no canteiro fica inviável |
| M3 | O RN aguenta 15 `<Image>` de arquivo local trocando durante o arraste sem piscar? | tela de teste com ladrilhos falsos, arrastar e observar | piscar: precisa de camada de cache em memória, mais trabalho |
| M4 | O canvas de 6000 px renderiza no navegador que o engenheiro usa? | abrir um orçamento com prancha A1 e conferir | falhar: os ladrilhos têm que ser gerados no servidor (ver 6.1) |

M1 e M4 são de minutos e não dependem de escrever nada. M2 e M3 são o meio dia.

### Fase 1: geometria e ladrilhos no import (web)

6. Migration: coluna `plan_geometry jsonb` em `work_project_snapshot`.
7. Ladrilhador em `src/lib/canvas/`, reaproveitando a configuração de pdf.js já existente.
   Entrada: PDF ou imagem. Saída: z0 + z1 em WebP e o `plan_geometry`.
   **Renderiza a página uma vez a 6000 px e fatia o canvas com `drawImage`**, não uma chamada de
   `page.render` por ladrilho (motivo em 4.2a).
8. Ligar no fluxo de import (`ImportWorkForm` → `createWorkFromBudget`), com upload para
   `${workId}/project/tiles/`.
9. Backfill: ação "gerar planta do campo" na página da obra, para as 5 obras já importadas.
9b. **Cache offline das marcações** (postes de projeto e instalações), na mesma lógica do
    `pdf-cache.ts`: caminho estável por obra, gravado a cada leitura boa, servido quando a rede
    falha. É o conserto de raiz do 2.7 e fecha a assimetria de a planta abrir sem sinal enquanto os
    postes somem. Não depende da pirâmide; pode ir antes dela.
10. Contrato: um documento novo em `docs/apk-contracts/` descrevendo a pirâmide, e nota de
    atualização no `06-pole-installations.md`.

### Fase 2: novo canvas no APK

11. `plan/tiles.ts`: cache offline em lote, versionado por `render_version`, com progresso.
12. `PlanTiles`: escolhe e monta os ladrilhos visíveis.
13. `coords.ts`: passa a ler `plan_geometry`; `planFrame` é removido.
14. `postes.tsx`: troca o `<Pdf>` pelo `<PlanTiles>`. `react-native-pdf` sai da tela de planta.
15. Fallback: se a obra ainda não tem ladrilhos (backfill não rodou), cai no caminho antigo do PDF
    com o paliativo da Fase 0. Não pode existir obra que não abre.

### Fase 3: fluxo de marcação

16. Modo ver e modo marcar, com o modo marcar entrado por Registrar, conforme
    `MD/redesenho-apk/NavMap.dc.html`.
17. Pino provisório arrastável e passo de confirmação antes da `NovoPosteSheet`.

### Fase 4: validação

18. Rodar contra o gerente de teste (`gerente@teste.orcarede`, ambiente dev) o caminho completo:
    abrir planta sem sinal, marcar poste, conferir que ele aparece no portal do engenheiro na
    posição certa. É o item 3 do roteiro de `andamento-obra-decisoes-arquitetura.md`, que segue em
    aberto.

---

## 8. Riscos e o que fica de fora

### 8.1. M1 medido, 3 set 2026

Feito em emulador `Pixel_10a` (1080 × 2424, densidade 420, ou seja 411 dp a 2,625×), contra a obra
real "Loteamento Sol Poente" no Supabase de dev, prancha paisagem em `render_version 1`, 9 postes de
projeto e 5 instalados. Método: forçar o fator 4 antigo, afastar até a página caber, e comparar
recortes ampliados em três alturas.

**Resultado:**

| Altura na página | Estado |
| --- | --- |
| ~10% (legenda de símbolos) | ilegível, mancha azul |
| ~45% (tabela de coordenadas) | transição: **esquerda borrada, direita nítida** |
| ~80% (características dos para-raios) | nítido, texto de 2 mm legível |

**Duas conclusões:**

1. **A direção do meu diagnóstico estava invertida.** O borrão fica em cima, não embaixo. Causa: o
   `CacheManager` despeja o mais antigo, e o mais antigo é o topo. Corrigido na seção 2.5.
2. **A assinatura confirma o mecanismo melhor do que uma divisa reta confirmaria.** Na faixa de
   transição a esquerda está borrada e a direita nítida, ou seja o corte cai no MEIO de uma linha de
   ladrilhos. Isso só acontece com percurso linha a linha e despejo por idade. Se a causa fosse
   outra (limite de textura, escala de bitmap), a transição seria uma reta horizontal limpa ou não
   existiria.

**Discrepância honesta com o relato de campo.** O print original descrevia "de um ponto pra baixo
fica pouco nítido", que é o contrário do medido. Hipótese, **não verificada**: o desenho é
assíncrono e progride de cima pra baixo, então logo depois de abrir a tela o topo já está pronto e a
base não. Quem olha cedo vê topo nítido e base borrada; quem olha depois que terminou vê o
inverso, porque aí o topo já foi despejado. Se for isso, a divisa se move sozinha e as duas
observações estão certas em momentos diferentes. Dá para confirmar com dois prints da mesma tela,
um imediato e um cinco segundos depois.

Nada disso muda o plano: com o fator calculado da Fase 0 a página inteira cabe no cache, nada é
despejado, e a nitidez é uniforme (verificado no mesmo emulador).

### 8.2. Grau de confiança, item a item

Honestidade sobre o que é certeza e o que é aposta:

| Afirmação | Base | Confiança |
| --- | --- | --- |
| Pinos 4× menores (2.1) | aritmética sobre código lido | certeza |
| Reset de zoom (2.2), `setPageSize` (2.3), gestos (2.6) | código lido | certeza |
| `pageSize` escalado no Android (2.4) | fonte Java da biblioteca lida | certeza; que hoje não quebra é dedução |
| Cache de 120 ladrilhos causa a divisa (2.5) | **medido em emulador, seção 8.1** | confirmado; direção do borrão estava invertida e foi corrigida |
| Fator calculado deixa a planta nítida por inteiro | **medido em emulador**, topo e base legíveis | confirmado |
| Pinos voltam ao tamanho certo com `1/scale` | **visto em emulador**, disco verde e anel cinza legíveis | confirmado |
| Toque num pino seleciona e abre a folha | **exercitado em emulador** | confirmado |
| Pirâmide resolve sem teto | prática corrente, EmbedPDF em produção | alta |
| Pirâmide cabe em MB aceitáveis | estimativa por compressão de traço | **não medida** (M2) |
| RN aguenta os ladrilhos sem piscar | nenhuma | **não medida** (M3) |
| Ladrilhos gerados no navegador | limites de canvas pesquisados | depende do navegador (M4) |

- **Não validei nada em aparelho.** Os números da seção 2.5 (18 × 13 ladrilhos, divisa perto da
  metade) são derivados das constantes da biblioteca e de uma tela de 374 dp a 3×, não medidos.
  A conclusão qualitativa (cache estourado, divisa horizontal, thumbnail esticado abaixo) não
  depende dos números exatos; a altura exata da divisa, sim.
- **Possível bug já existente no web, fora do escopo deste plano.** Se a medição M4 falhar, o
  `CanvasVisual` está falhando no Safari hoje para prancha grande em `render_version 2`. Vira
  entrada própria em `known-debt.md`, não uma fase daqui.
- **iOS.** O APK é Android hoje. A Fase 2 melhora a situação (tira o PDF do caminho), mas a
  paridade de iOS não está no escopo e não foi verificada.
- **Muitos postes.** Nenhuma das fases trata agrupamento de pinos. Numa obra com centenas de postes
  no mesmo trecho, a planta vai ficar poluída no zoom baixo. Fica registrado como dívida, não como
  fase.
- **Multipágina.** O snapshot guarda `pdf_num_pages`, mas a tela do APK usa `singlePage` e sempre a
  página 1. Continua assim. Se existir projeto com prancha em mais de uma página, isso vira um
  problema separado, e a pirâmide precisaria de um eixo a mais.
- **A Fase 0 item 5 é uma troca, não um conserto.** Aceita menos detalhe no zoom máximo em nome de
  nitidez uniforme, até a Fase 2. Se essa troca não for aceitável, o caminho é o `patch-package`,
  que custa um build.

---

## 9. Referências de código consultadas

| Arquivo | O que tem |
| --- | --- |
| `ApkOrcaRede/app/(main)/obra/[workId]/postes.tsx` | tela da planta, `PLAN_RENDER_SCALE`, decisão do toque |
| `ApkOrcaRede/src/components/obra/PlanViewport.tsx` | zoom, pan, composição de gestos |
| `ApkOrcaRede/src/components/obra/PolePin.tsx` | pino e contra-escala |
| `ApkOrcaRede/src/lib/plan/coords.ts` | `planFrame`, conversão lógico↔tela |
| `ApkOrcaRede/src/lib/project/pdf-cache.ts` | cache offline da planta (a lógica que será reaproveitada) |
| `ApkOrcaRede/node_modules/react-native-pdf/android/.../PdfView.java` | `loadComplete` e o `getPageSize` escalado |
| `ApkOrcaRede/node_modules/react-native-pdf/android/build.gradle` | dependência do AndroidPdfViewer 4.0.1 |
| `src/components/andamento-obra/works/canvas/WorkCanvas.tsx` | canvas do portal, centralização em (3000,3000) |
| `src/lib/canvas/pdfRenderConfig.ts` | `calculatePdfPageDimensions`, origem do V1/V2 |
| `src/lib/canvas/canvasTokens.ts` | `CANVAS_SIZE`, `CANVAS_CENTER` |
| `src/lib/canvas/rasterPlanGeometry.ts` | geometria de planta raster |
| `src/components/CanvasVisual.tsx` | rasterização em 6000 px com pdf.js (base do ladrilhador) |
| `src/actions/works.ts` | import, cópia da planta, normalização de coordenada |
| `docs/apk-contracts/06-pole-installations.md` | contrato do quadro lógico 0..6000 |
| `MD/redesenho-apk/NavMap.dc.html`, `Poste.dc.html` | redesenho: Poste como entrada de Registrar |
