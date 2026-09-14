# Testes de campo: roteiro e resultados

> Registro de execução, não plano. A fonte de verdade do módulo continua sendo
> `docs/andamento-obra.md`; este arquivo existe porque teste tem **resultado**, e
> resultado se acumula: cada rodada acrescenta uma linha em vez de reescrever.
>
> Tudo aqui roda em **dev**, contra a obra de teste da seção 1, no emulador do
> Android Studio. Nenhum teste toca produção.

**Criado em:** 10 set 2026
**Última rodada:** 11 set 2026 (preparação; o ciclo ainda não rodou)

---

## 1. A obra de teste

Montada em 10 set 2026, a partir de uma **cópia** de orçamento real. A cópia
existe para os testes poderem acrescentar e apagar postes no orçamento sem mexer
no projeto de ninguém: a sincronia é justamente um dos testes.

| | |
| --- | --- |
| Obra | `ba6feced-1c01-4321-afdd-92712eccc5d7` — "ZZ TESTE CAMPO — Weissberg II" |
| Orçamento (cópia) | `d3d3ffb0-bdd0-444f-86e7-6948a4d70063` — "ZZ TESTE CAMPO — WEISSBERG ETAPA II" |
| Orçamento original | `b3ac008f-1a81-42f5-9963-c2299d3d415a` (não deve ser tocado) |
| Prancha | A1 paisagem, 2384×1684 pt, sem rotação, `render_version 2` |
| Postes de projeto | 52 |
| Conexões de projeto | 0 |
| Marcos | 6 (semeados automaticamente) |
| Engenheiro | `3be0e200-…` |
| Gerente | `gerente@teste.orcarede` (`aabdc360-…`) |

**Por que este orçamento.** Sobrepus os 52 postes sobre a prancha renderizada
antes de escolher: eles caem em cima dos símbolos de poste, ao longo das ruas.
Num orçamento com postes posicionados por cima, o teste do "toque no poste
cinza" não provaria nada.

**O que a obra não tem, e o que isso significa.** Zero conexões de projeto.
Então o trecho de rede vai ser registrado pelas duas pontas (`from_post_id` e
`to_post_id`) em vez de pela ligação prevista, que é o caminho que a RPC também
aceita. O caso "vão previsto vira linha cheia" não é exercitável nesta obra.

---

## 2. Como ler os resultados

| Símbolo | Significado |
| --- | --- |
| ✅ | Passou como esperado |
| ⚠️ | Passou, mas com ressalva anotada |
| ❌ | Falhou |
| ⏳ | Ainda não rodou |
| 🚫 | Não exercitável nesta obra |

---

## 3. Preparação

| # | O quê | Esperado | Resultado |
| --- | --- | --- | --- |
| P1 | Obra de teste criada a partir de cópia de orçamento | 52 postes de projeto, gerente vinculado, prancha no bucket | ✅ 10 set |
| P2 | Emulador do Android Studio de pé | AVD iniciado e visível no `adb devices` | ✅ 11 set: `Pixel_10a`, `emulator-5554` |
| P3 | App rodando no emulador apontando para dev | Login abre | ✅ 11 set, depois do achado 9.1. Dev client compilado e instalado, Metro em 8081, sessão do gerente já salva |
| P4 | Portal rodando local apontando para dev | Lista de obras abre | ✅ 11 set: o `.env.local` aponta para **produção**. Em vez de editá-lo, os três valores de dev foram para `.env.development.local`, que tem precedência maior no Next e é descartável. Ver achado 9.2 |

---

## 4. Portal (engenheiro)

| # | O quê | Esperado | Resultado |
| --- | --- | --- | --- |
| W1 | Abrir a obra | Abre no canvas, não num painel de números | ⏳ |
| W2 | As abas | Quatro: Obra, Dia a dia, Conversa, Marcos. Nada de Checklists, Equipe, Galeria, Documentos, Diário | ⏳ |
| W3 | Cabeçalho | Postes de pé, rede lançada, marcos, último registro | ⏳ |
| W4 | Canvas | 52 postes do projeto desenhados sobre a prancha, em cima dos símbolos | ⏳ |
| W5 | Home | Obra aparece; sem impedimento, não está no vermelho | ⏳ |
| W6 | Dia a dia sem registro nenhum | Estado vazio explicando que o dia aparece sozinho, sem formulário | ⏳ |

---

## 5. App (gerente, no emulador)

| # | O quê | Esperado | Resultado |
| --- | --- | --- | --- |
| A1 | Login com o gerente de teste | Entra; se a senha for temporária, obriga a troca | ⚠️ 11 set: o app abriu já logado, com a sessão salva, então a tela de login não foi exercitada. O `must_change_password` do gerente de teste está nulo: a troca obrigatória da E8 precisa de um gerente criado do zero pelo portal |
| A2 | Lista de obras | A obra de teste aparece | ✅ 11 set: "ZZ TESTE CAMPO, Weissberg II", 0 de 52 postes, marco 1 de 6 |
| A3 | Abrir a obra | Abre direto na planta | ✅ 11 set: abre na Planta, com "0 de 52 postes" no cabeçalho |
| A4 | A planta | Prancha carrega; 52 anéis cinza sobre os símbolos de poste | ✅ 11 set, **o resultado mais importante da rodada**. Ampliado, cada anel envolve um símbolo de poste, com as linhas de ramal saindo do centro. Ver achado 9.3 |
| A5 | Toque no vazio | Não acontece nada | ✅ 11 set |
| A6 | Toque num poste cinza | Abre a ficha com tipo do projeto e "levantei este poste" | ✅ 11 set: "Poste 17 03", tipo 9-4kN TC, "Do projeto, ainda não levantado", um botão só |
| A7 | Levantar o poste | Pede foto; numeração e tipo já vêm preenchidos | ✅ 11 set: numeração e tipo preenchidos, foto obrigatória, botão travado em "Fotografe para registrar" até a foto existir. Ver achado 9.4 sobre o GPS |
| A8 | Depois de salvar | O pino fica verde na hora, o cinza some, o contador do cabeçalho sobe | ✅ 11 set: as três coisas, "0 de 52" virou "1 de 52" |
| A9 | Tocar no mesmo poste de novo | É o poste levantado, não a ficha de levantar | ✅ 11 set: selo "Instalado", tipo, GPS e "Marcado agora" |
| A10 | Barra de baixo | Obra, Dia, Conversa, Equipe | ✅ 11 set: as quatro, nessa ordem |
| A11 | Folha Registrar | Poste, Equipamento, Rede, Impedimento. Sem Diário e sem Checklist | ✅ 11 set: os quatro, mais Marco, e o rodapé "Tudo salva no aparelho e envia sozinho". Nada de Diário nem Checklist |
| A12 | Equipamento no poste levantado | Salva com estruturas marcadas | ⚠️ 11 set: salva, mas só pelo caminho "montei fora do projeto". O caminho do previsto não existe nesta obra. Ver achado 9.5 |
| A13 | Trecho de rede entre dois postes | Salva com metragem e categoria | ⏳ |
| A14 | Aba Dia | Mostra os três registros, agrupados por dia, com os números no topo | ⏳ |
| A15 | Impedimento | Abre; a planta ganha faixa vermelha no topo | ⏳ |

---

## 6. O caminho de volta (o que o engenheiro vê)

| # | O quê | Esperado | Resultado |
| --- | --- | --- | --- |
| V1 | Poste levantado no app | Aparece verde no canvas do portal, no mesmo lugar | ⏳ |
| V2 | Equipamento | Aparece na ficha do poste, com quantidade | ⏳ |
| V3 | Trecho | Aparece como linha cheia no canvas | ⏳ |
| V4 | Dia a dia | Os três registros no dia certo, com hora, e as fotos | ⏳ |
| V5 | Impedimento | Faixa vermelha no topo da obra e no cartão da home | ⏳ |
| V6 | Cabeçalho | Postes e metragem batem com o que foi registrado | ⏳ |

---

## 7. Sincronia do orçamento

| # | O quê | Esperado | Resultado |
| --- | --- | --- | --- |
| S1 | Acrescentar um poste na cópia do orçamento | Desce cinza para a obra sem ninguém pedir | ⏳ |
| S2 | O gerente vê | O poste novo aparece na planta do app, e chega notificação | ⏳ |
| S3 | Mover um poste no orçamento | O pino anda nos dois lados | ⏳ |
| S4 | Apagar um poste cinza | Some da obra | ⏳ |
| S5 | Apagar um poste **verde** | Não some; segue contado como divergência | ⏳ |

---

## 8. Sem sinal

| # | O quê | Esperado | Resultado |
| --- | --- | --- | --- |
| O1 | Modo avião, abrir a planta | Abre com a prancha e com os postes | ⏳ |
| O2 | Levantar um poste sem rede | Salva, pino fica verde, entra na fila | ⏳ |
| O3 | Aba Dia sem rede | Mostra o registro marcado como na fila | ⏳ |
| O4 | Religar a rede | A fila drena sozinha | ⏳ |
| O5 | Depois de drenar | O registro chega ao portal com a hora do campo, não a da chegada | ⏳ |

---

## 9. Achados

Cada rodada acrescenta aqui o que quebrou, com o que foi feito a respeito.

### 9.1. A máquina não tem JDK, só JRE (11 set)

`expo run:android` morre em `Toolchain installation '/usr/lib/jvm/java-21-openjdk-amd64'
does not provide the required capabilities: [JAVA_COMPILER]`. A máquina tem
`openjdk-21-jre` e `openjdk-21-jre-headless` instalados, e nenhum pacote `-jdk`:
não existe `javac` em nenhum dos três diretórios de `/usr/lib/jvm`. O Gradle
também não consegue baixar um sozinho, porque o `settings.gradle` do prebuild não
traz o resolvedor de toolchain (foojay).

O JDK 25 embutido no Android Studio (`~/android-studio/jbr`) existe, mas está à
frente do que o AGP desta versão suporta, e trocar para ele troca um erro por
outro.

**Resolvido sem sudo,** porque a sessão não tem senha para o apt. O Temurin JDK 21
foi extraído em `~/.jdks/jdk-21.0.12.1+1` (ao lado de um JDK 17 que já morava lá), e
o Gradle passou a enxergá-lo por `~/.gradle/gradle.properties`:

```
org.gradle.java.installations.paths=/home/devpaulo/.jdks/jdk-21.0.12.1+1,/home/devpaulo/.jdks/jdk-17.0.20.1+1
org.gradle.java.home=/home/devpaulo/.jdks/jdk-21.0.12.1+1
```

Fica fora do repositório de propósito: é configuração de máquina, não do projeto.
Se um dia o `openjdk-21-jdk-headless` for instalado pelo apt, essas duas linhas
podem sair.

### 9.2. O portal apontava para produção (11 set)

O `.env.local` tem os dois ambientes, com o bloco de dev comentado e o de
**produção** ativo. Testar o ciclo assim escreveria poste de teste no banco do
cliente.

Em vez de trocar os comentários, os três valores de dev foram copiados para
`.env.development.local`, que no Next tem precedência sobre o `.env.local` e
some com um `rm`. O `.gitignore` já cobre `.env*`. O `next dev` confirma na
subida: `Environments: .env.development.local, .env.local`.

**Antes de qualquer coisa ir para produção, apagar esse arquivo.**

### 9.3. A geometria fecha no aparelho, e não só no servidor (11 set)

Os 52 anéis cinza caem em cima dos símbolos de poste da prancha, conferido com
ampliação: cada anel envolve um símbolo, com as linhas de ramal saindo do centro.
É a prova de que a `plan_geometry` gravada na E4 resolve a R1, medida no
aparelho, que era onde o erro de 77 m da seção 10.1 nascia.

**Um susto pelo caminho, que vale registrar.** À primeira vista os anéis parecem
deslocados, porque ocupam só uma faixa horizontal da prancha enquanto os símbolos
de poste cobrem o desenho inteiro. Não é deslocamento: os postes desta etapa vão
de x 578 a 5409, a largura toda, mas de y 2925 a 3953, dentro de uma planta que
ocupa de 881 a 5119. A etapa II é mesmo uma faixa, e os postes de cima são de
outra etapa. Quem for conferir isto de novo, amplie antes de concluir.

### 9.4. O GPS do emulador engana (11 set)

O primeiro poste gravou `37.4219983, -122.084`, que é a sede do Google, a posição
padrão do emulador, mesmo com o app mostrando "GPS ±5 m" em verde.

Não é bug do app. O `captureGps` usa `getCurrentPositionAsync` com precisão alta,
que pede posição nova, e não a última conhecida. O segundo poste, com
`adb emu geo fix -52.4091 -28.2612` aplicado antes, gravou
`-28.2611983, -52.4091`, exatamente o ponto injetado.

**Para as próximas rodadas:** injetar a posição antes de cada registro, senão os
dados de teste ficam com coordenada da Califórnia e ninguém entende depois.

### 9.5. O equipamento só tem um caminho, e o app diz isso na cara (11 set)

A tela de equipamento abre com **"O projeto desta obra não trouxe catálogo de
estruturas. Use o campo abaixo para registrar o que montou."** É a questão A1 da
seção 8 do andamento aparecendo no uso real: a lista de estruturas previstas vive
em `post_item_groups`, no orçamento, e não é copiada para a obra.

O app se comporta bem: diz o que falta em vez de inventar lista. Mas o item 2 do
roteiro da E9, "montar equipamento pelos dois caminhos", **não é exercitável**
enquanto a A1 não for resolvida. Só o caminho de fora do projeto roda.

O que rodou gravou certo: item `N3-BT`, quantidade 1, `from_project` falso,
vinculado à instalação do poste 23 17, com `client_event_id` e `installed_at`
antes do `created_at`.

Uma escolha de tela que vale elogiar: o equipamento começa perguntando **em qual
poste**, e lista só os levantados. Não há como montar equipamento em poste que
ainda não subiu.

### 9.6. Dois postes registrados sem querer (11 set)

Automatizando a navegação por coordenada de toque, reusei as posições do fluxo do
poste e acabei levantando `Cruz BT 3 10` e `23 17` sem ter escolhido. Ficam na
obra de teste, sem prejuízo.

**Lição para a próxima rodada automatizada:** conferir a tela por captura antes de
cada toque. Encadear toques às cegas atravessa fluxo inteiro, porque as telas
compartilham as mesmas posições de botão.
