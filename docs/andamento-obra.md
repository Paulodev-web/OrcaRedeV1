# Andamento de Obra

> **Fonte de verdade do módulo.** Web e APK, um documento só.
> Reescrito em 10 set 2026 para o escopo novo. Tudo que existia antes está em `docs/_arquivo/`, morto.
> O visual está em `MD/canvas-campo/` e publicado em
> https://claude.ai/code/artifact/0dc5ab6e-5e67-4b43-8036-b895ee643373
>
> Regra de manutenção: este arquivo é atualizado **na mesma entrega** que muda o sistema. Não existe
> plano paralelo, roadmap separado nem contrato em outro lugar. Se der vontade de criar um, é sinal
> de que a seção 9 está grande demais.

**Última atualização:** 10 set 2026 (E1 a E8 fechadas; resta o ciclo com aparelho)

---

## 1. O que é

Duas pontas de um mesmo trabalho: o gerente registra o que executou no canteiro, o engenheiro vê a
obra crescer e conversa com ele.

O eixo do sistema é **o canvas mais a conversa**. Tudo o mais é consequência de um dos dois.

### 1.1. Personas

| Quem | Onde | Pode |
| --- | --- | --- |
| Engenheiro responsável | portal web | ver a obra, conversar, aprovar marco, criar usuário do app |
| Gerente de obra | APK | registrar execução e conversar, só nas obras onde está alocado |

### 1.2. Princípios travados

1. **Offline-first no APK.** Tudo entra numa fila em SQLite e sobe sozinho. O canteiro é zona rural
   com 3G ruim, e isso é a premissa, não a exceção.
2. **Idempotência em toda escrita de campo**, por `client_event_id` único. A fila pode reenviar; o
   banco não pode duplicar.
3. **RLS rigorosa.** O gerente enxerga só a obra onde está alocado.
4. **GPS em toda ação de campo.**
5. **Ninguém digita duas vezes.** Se o sistema pode derivar, o sistema deriva.
6. **O orçamento manda sempre.** O planejado vive no orçamento; a obra o segue. Isto **substitui**
   o princípio antigo de snapshot congelado, e a troca está explicada em 1.4.
7. **Ninguém cria poste em campo.** O gerente acende o que já foi projetado. Faltou poste, ele fala
   no chat e o engenheiro acrescenta no orçamento.

### 1.3. O corte de 10 set 2026

O escopo original tinha nove abas no portal e treze fluxos no APK, e nada disso jamais rodou em
campo. O corte reduz o sistema ao que o gerente faz o dia inteiro e ao que o engenheiro precisa
saber.

**Sai da navegação (o código dorme, não é apagado):** checklists, formulário de diário e seu fluxo
de aprovação, equipe e presença, galeria, documentos, curva S.

**Fica:** canvas compartilhado (poste, equipamento, trecho de rede), conversa, dia automático,
impedimento, marcos, e o cadastro de usuários do app.

**A troca de fundo:** o diário deixa de ser um formulário de dez campos que o gerente preenche e o
engenheiro aprova, e passa a ser uma **leitura** do que já foi registrado. Ninguém escreve
relatório.

### 1.4. A corrente: um desenho só, três papéis

Decidido em 10 set 2026. O poste deixa de ser uma coisa que o gerente cria e passa a ser **o estado
de um poste que o orçamento já desenhou**.

```
Orçamento            →   Portal              →   APK
o engenheiro desenha     acompanha               executa
posição, numeração,      todos os postes,        toca no cinza,
tipo, estruturas         cinza e verde           ele fica verde
```

**Cinza é o que falta, verde é o que está de pé.** Vale igual para o vão: tracejado é cabo previsto,
cheio é cabo lançado.

O que isso apaga do mapa de problemas, de graça:

- **A divergência de coordenada** (10.1) deixa de ser problema de dado. Se o campo não produz
  coordenada, e sim acende uma que veio do orçamento, não há dois quadros lógicos para divergir.
  Sobra um problema de desenho: os dois lados precisam rasterizar a mesma prancha do mesmo jeito
  para o anel cinza cair sobre o símbolo certo.
- **O poste fantasma.** Não existe mais toque no vazio, então não existe mais registro por acidente.
- **A dúvida sobre parear com o projeto.** Virou a única forma que existe.

#### As quatro regras da sincronia

| No orçamento | Na obra |
| --- | --- |
| Acrescentou um poste | Desce cinza. É assim que o poste pedido pelo campo chega. |
| Tirou um poste | Some **se ainda estiver cinza**. Verde nunca some: foi executado de verdade, e apagar seria mentir sobre a obra. Ele fica marcado como fora do projeto atual. |
| Moveu um poste | O pino anda nos dois lados. O GPS gravado no campo fica como estava. |
| Mexeu no preço | Nada acontece. A obra não enxerga valor, e o canteiro nunca vai ver orçamento. |

A sincronia olha **geometria**: postes, vãos e as estruturas previstas de cada poste. Nunca preço,
nunca condição comercial.

**O que a troca custa.** O orçamento passa a ser um documento com consequência no canteiro: mexer
nele mexe na obra de alguém. Antes ele era um rascunho comercial que, uma vez importado, não
afetava mais ninguém.

#### Coordenada e GPS passam a ter papéis diferentes

A posição no canvas é a do projeto, e é ela que se move se o engenheiro reposicionar o poste. O GPS
capturado no campo fica como evidência de onde ele foi construído de fato. Um diz onde deveria
estar, o outro diz onde está.

---

## 2. Mapa de telas

| APK | | Portal | |
| --- | --- | --- | --- |
| A1 | Login | W1 | Obras (home) |
| A2 | Minhas obras | W2 | Obra · canvas |
| A3 | Obra · planta | W3 | Obra · dia a dia |
| A3b | Ficha do poste | W4 | Obra · conversa |
| A4 | Obra · dia | W5 | Obra · marcos |
| A5 | Obra · conversa | W6 | Usuários do app |
| A6 | Registrar (folha) | | |
| A7 | Capturas: poste, equipamento, rede, impedimento, marco | | |

O impedimento não é tela de destino em nenhum dos dois lados: no APK é a entrada vermelha da folha
Registrar, no portal é faixa no topo da obra e da home. Emergência que mora em aba é emergência que
alguém precisa ir buscar.

---

## 3. As telas do APK

Contexto de uso que governa todas: aparelho Android barato, sol forte, luva, sinal ruim, uma mão
segurando outra coisa. Piso de texto 15 px, alvo mínimo 44 px, nada de gesto que dependa de
precisão fina.

### A2 · Minhas obras

**Serve para:** escolher a obra e ver se algo ficou para trás.

- Cartão por obra: nome, cliente, progresso em postes, e no máximo dois selos (impedimento aberto,
  mensagens novas).
- **Faixa de fila** no topo, só quando há item preso: "3 registros esperando sinal". Some sozinha
  quando drena.
- Estado vazio: gerente sem obra alocada vê um aviso que manda falar com o engenheiro, não uma
  lista vazia.

**Pronto quando:** o gerente abre o app sem sinal e ainda vê suas obras e a contagem da fila.

### A3 · Obra · planta

**A casa da obra.** Abre aqui, não num painel de números.

- Prancha do projeto ao fundo, cacheada por obra. Sem sinal, abre igual.
- **Todo poste do projeto aparece.** Anel cinza vazado é o que falta levantar; disco cheio verde é o
  que está de pé; disco verde com miolo branco é o que já recebeu equipamento. **A diferença é de
  forma, não só de cor**, porque sob sol forte cinza e verde a 5 px são a mesma coisa.
- Vão tracejado é cabo previsto, vão cheio é cabo lançado.
- Numeração aparece acima de 2,5× o encaixe, senão vira sopa de letra.
- **Tocar num poste cinza abre a ficha dele** (A3b). Tocar num verde abre a mesma ficha, já com o
  registro. Tocar no vazio não faz nada.
- Faixa fixa acima da barra de destinos: "toque num poste cinza, 20 ainda por levantar". A instrução
  mora na tela, não num tutorial que ninguém lê.
- Botão de reenquadrar sempre no mesmo canto. Pill escura de "sem sinal, planta guardada" quando
  offline.

**Pronto quando:** o gerente acende um poste de luva sem conseguir errar o alvo, e nada é gravado
por acidente.

### A3b · Ficha do poste

A folha que sobe ao tocar num poste. É o centro de gravidade do APK: quase tudo acontece aqui.

**Poste cinza:** o que o projeto prevê naquele ponto (tipo do poste e a lista de estruturas com
quantidade), e **um botão só**, "levantei este poste", que leva à captura.

**Poste verde:** a foto, a hora, quem levantou, o que já foi montado, e o que o projeto previa e
ainda não subiu. Daqui sai a ação de registrar equipamento.

### A4 · Obra · dia

**Serve para:** o gerente conferir o próprio dia sem escrever nada.

- Três números no topo: postes, metros, estruturas. Derivados, não digitados.
- Linha do tempo agrupada por dia, com hora de cada registro e miniatura da foto.
- Item ainda na fila aparece em âmbar, com "sobe quando pegar sinal". A fila não é uma tela
  separada: ela é o mesmo dia, com estado diferente.
- Filtros por tipo, incluindo "na fila".

### A5 · Obra · conversa

- Texto, foto e vídeo nos dois sentidos. **Áudio com player de verdade**, que hoje não existe.
- Bolha do que está na fila marcada em âmbar, não escondida.
- Chips de contexto no fio: "3 estruturas montadas no P2, 11:05", clicável para o dia. A conversa
  sabe o que aconteceu na obra.

### A6 · Registrar

Folha do botão central. Três faixas largas para o que se faz o dia inteiro (Poste, Equipamento,
Rede), o impedimento sozinho e em vermelho logo abaixo, e Marco em lista.

### A7 · As capturas

Anatomia comum às três: **prova primeiro** (foto), depois o que o projeto já sabe preenchido,
depois o que só o campo sabe. Rodapé sempre diz o estado da rede como informação, nunca como erro.

**Poste:** entrada pela ficha do poste cinza. Foto obrigatória, numeração e tipo vindos do projeto
em leitura, observação livre.
**Equipamento:** duas entradas, a ficha do poste e a folha do +. Lista do que o projeto prevê naquele
poste com contador, item fora do projeto por texto livre, foto opcional.
**Rede:** vão escolhido entre dois postes do projeto, categoria vinda do projeto, metros medidos com
o previsto ao lado e a diferença em selo, tipo de cabo, foto opcional.

Em nenhuma das três o campo escolhe onde a coisa fica. A posição já veio do orçamento.

---

## 4. As telas do portal

### W1 · Obras

Duas listas, não quatro: **precisa de você agora** (impedimento aberto, marco esperando aprovação) e
**em andamento normal**. Coluna da direita com o que chegou do campo, cronológico.

Sinal de silêncio: obra sem registro há mais de dois dias mostra "sem registro há 3 dias" em âmbar.
Silêncio na obra é informação, e hoje ninguém a dá.

### W2 · Obra · canvas

Entrada padrão da obra. Cabeçalho com quatro números (postes, metros de rede, marcos, último
registro), quatro abas, faixa vermelha de impedimento acima de tudo quando houver.

Canvas com projeto ao fundo, execução por cima, legenda fixa. Clicar num poste abre o painel
lateral: foto, **o que foi montado nele**, o que o projeto previa e ainda não subiu, GPS real com
precisão.

### W3 · Obra · dia a dia

O diário automático. Coluna de dias à esquerda com resumo de cada um, o dia escolhido à direita:
quatro números, a linha do dia com hora, e a grade de fotos. Botão de imprimir, porque cliente pede.

Registro feito sem sinal mostra as duas horas: a do campo e a de chegada.

### W4 · Obra · conversa

O mesmo fio que o gerente vê, em largura de leitura. Player de áudio, indicador de lido, e os
mesmos chips de contexto.

### W5 · Obra · marcos

Os seis marcos em coluna. O que está aguardando decisão traz as fotos, a observação do gerente, e
**o que o sistema conta no período**: metros somados dos trechos, número de trechos, fotos. A
aprovação deixa de ser ato de fé.

### W6 · Usuários do app

Tabela de quem tem o app, em qual obra, estado do acesso (ativo, senha temporária, sem acesso) e
último registro. Formulário lateral cria a conta e vincula à obra numa ação só, com senha temporária
gerada.

---

## 5. Os fluxos

### 5.1. De cinza a verde, ponta a ponta

1. **O poste já está lá.** Veio do orçamento com posição, numeração, tipo e as estruturas que deve
   receber. Na planta do gerente é um anel cinza.
2. **Toca no cinza.** A ficha abre com o que o projeto prevê ali e um botão só.
3. **Foto e salvar.** Foto obrigatória, tipo já preenchido pelo projeto, observação se quiser. O GPS
   entra sozinho, como evidência. O poste fica verde na hora, antes de qualquer rede.
4. **A fila.** Registro e foto entram no SQLite. O worker tenta, recua, tenta de novo.
   `client_event_id` único garante que reenviar dez vezes acende o poste uma vez.
5. **Verde nos dois lados.** O mesmo poste acende no canvas do engenheiro, entra na linha do dia e
   no feed da home. Sem ação nenhuma do engenheiro: poste não se aprova, se levanta. A partir daí a
   ficha dele aceita equipamento.

**Poste que o campo levanta e não estava no projeto:** o gerente avisa no chat, o engenheiro
acrescenta no orçamento, e ele desce cinza. Só funciona sem travar o campo porque a sincronia é
viva; sem ela, o gerente esperaria uma reimportação de obra.

### 5.2. O dia que ninguém escreve

**Entrada:** `work_pole_installations`, `work_pole_equipment` (+ `_items`), `work_network_spans` e as
tabelas de mídia irmãs.

**Regra de agrupamento:**
- Agrupa por `installed_at`, a hora do aparelho, não a de chegada no servidor. Registro feito às
  16:38 sem sinal pertence ao dia 10 mesmo chegando às 19:12.
- Fuso da obra, `America/Sao_Paulo`. O corte do dia é meia-noite local, não UTC, senão registro de
  fim de tarde cai no dia seguinte.
- Soma o que dá para somar: postes contam, metros somam por categoria, estruturas somam por
  quantidade.

**Saída:** aba Dia a dia no portal, aba Dia no APK, e o bloco de evidência do marco.

**Dia sem registro aparece vazio e visível**, não some da lista.

### 5.3. Impedimento

Gerente abre pela folha Registrar com severidade, categoria, GPS e fotos. No portal vira faixa
vermelha no topo da obra e da home, e notificação. O engenheiro comenta, o gerente resolve em campo,
o engenheiro encerra. Push nos dois sentidos.

### 5.4. Marco

Gerente marca a etapa como concluída com foto e observação. O portal mostra junto o que o campo
registrou no período. Engenheiro aprova ou devolve com observação. Push de volta ao gerente.

### 5.5. A fila offline

Toda escrita passa por ela, sem exceção. Backoff progressivo, telemetria no Sentry, e a regra de
ouro: **a tela mostra o registro como feito assim que ele entra na fila**, com estado âmbar, nunca
um spinner esperando servidor.

### 5.6. A sincronia do orçamento

Contrato, não implementação: quando os postes, os vãos ou as estruturas previstas do orçamento
vinculado mudam, a obra recebe o diff, obedecendo às quatro regras de 1.4.

O que precisa ser verdade, seja qual for o mecanismo:

- **É um diff, não um recarregamento.** Poste executado não pode ser apagado e recriado, senão a
  execução se perde junto.
- **É idempotente.** Rodar duas vezes dá o mesmo resultado.
- **Roda sozinho.** O engenheiro não deve precisar clicar em "sincronizar"; se precisar, alguém vai
  esquecer e o gerente vai trabalhar em cima de projeto velho.
- **Deixa rastro.** Poste que sumiu ou apareceu vira entrada no dia a dia, senão a obra muda de
  forma sem ninguém saber por quê.

---

## 6. Modelo de dados e contratos

### 6.1. O que grava onde

| Ação no APK | RPC | Tabelas |
| --- | --- | --- |
| Poste levantado | `rpc_record_pole_installation` | `work_pole_installations` + `_media` |
| Equipamento montado | `rpc_record_pole_equipment` | `work_pole_equipment` + `_items` + `_media` |
| Trecho lançado | `rpc_record_network_span` | `work_network_spans` + `_media` |
| Mensagem | `rpc_send_work_message` | `work_messages` + `work_message_attachments` |
| Impedimento aberto | `rpc_open_alert` | `work_alerts` + `_updates` + `_media` |
| Resolver em campo | `rpc_resolve_alert_in_field` | idem |
| Comentar | `rpc_add_alert_comment` | `work_alert_updates` + `_media` |
| Marco concluído | `rpc_report_milestone` | `work_milestones` + `_events` + `_media` |

Todas `SECURITY DEFINER`, recebem JSONB, transação atômica, `client_event_id` único.

**O que muda com o modelo novo:** `rpc_record_pole_installation` deixa de receber coordenada do
campo. Ela passa a receber o `project_post_id` e a copiar a posição de `work_project_posts`. As
colunas `x_coord` e `y_coord` continuam existindo e continuam preenchidas, para não quebrar o que já
lê delas, mas quem as autora é o projeto. O GPS segue vindo do aparelho, com outro papel (1.4).

O mesmo vale para `rpc_record_network_span`, que já nasceu certo: ela referencia `connection_id`,
`from_post_id` e `to_post_id`, ou seja, o vão previsto.

**Dormem:** `rpc_publish_daily_log` e `rpc_mark_checklist_item`.

### 6.2. Storage

Bucket `andamento-obra`, sempre prefixado por obra:

```
{work_id}/project/            {work_id}/pole-installations/{id}/
{work_id}/chat/{msg}/         {work_id}/alerts/{id}/
{work_id}/milestones/{id}/    {work_id}/pole-equipment/{id}/      (novo)
                              {work_id}/network-spans/{id}/       (novo)
```

### 6.3. Realtime e push

Canais `work:{id}:chat`, `work:{id}:events`, `user:{id}:notifications`. O push sai de um trigger em
`notifications` que entrega aos tokens Expo do usuário.

Gatilhos que continuam: mensagem nova, impedimento aberto, mudança de status de impedimento, marco
reportado, decisão de marco, poste instalado.
Gatilhos que dormem: os de checklist e de diário.
Gatilhos que faltam: equipamento montado e trecho lançado.

---

## 7. O catálogo de trabalho

Quatro grupos. Cada item diz onde mexe, por que existe, e como se sabe que acabou.

### 7.1. Construir (não existe hoje)

**C1. Dia a dia no portal (W3).**
Service novo em `src/services/works/` agregando as três origens por dia com a regra 5.2, mais a
página e os componentes. É o coração do escopo novo.
*Pronto quando:* um dia com registros de três tipos aparece somado e ordenado, e um dia sem
registro aparece vazio em vez de sumir.

**C2. Equipamento e rede no canvas do portal (W2).**
Camada nova em `WorkCanvas` para trechos executados, e o painel do poste passando a listar o que foi
montado nele e o que o projeto previa e não subiu.
*Pronto quando:* um poste com equipamento se distingue no canvas e a ficha mostra as duas listas.

**C3. Migration de equipamento e rede em produção.** ✅ feita em 10 set 2026.
Cinco tabelas, duas RPCs, dez policies de RLS e duas de storage. Dev e produção em paridade.

**C4. Ficha do poste e o acender (A3, A3b).**
`postes.tsx` deixa de criar poste por toque livre. Toque num pino abre a ficha; a ficha do cinza
oferece "levantei este poste" e leva à captura. Some o pino provisório, some o raio de acerto
ambíguo, some a folha de novo poste como ela é hoje.
*Pronto quando:* não existe caminho no app que crie um poste que o projeto não previu.

**C5. Vínculo poste instalado com poste de projeto.**
Coluna `project_post_id` em `work_pole_installations`, preenchida sempre. É o que torna
"12 de 32 postes" uma frase verdadeira e o que faz o cinza virar verde.
*Pronto quando:* o portal e o APK dizem, olhando a mesma tabela, quais postes ainda faltam.

**C9. A sincronia do orçamento (5.6).**
O contrato está em 5.6. É o item de maior risco do catálogo, porque toca um sistema que hoje é
comercial e passa a ter consequência operacional.
*Pronto quando:* o engenheiro acrescenta um poste no orçamento e ele aparece cinza no aparelho do
gerente sem ninguém reimportar nada, e um poste já executado sobrevive a ser apagado do orçamento.

**C6. Player de áudio e vídeo no APK.**
`expo-av` já está instalado e não é usado. Hoje o gerente vê a palavra "Audio (12s)" e não consegue
ouvir.
*Pronto quando:* áudio e vídeo enviados pelo portal tocam no aparelho.

**C7. Notificação de equipamento e trecho.**
Existe `on_pole_installation_notify`; faltam os equivalentes.
*Pronto quando:* o engenheiro é avisado dos três tipos de registro, não só de um.

**C8. Cache offline das marcações.**
A prancha tem cache por obra, as marcações não. Hoje a planta abre sem sinal e vem vazia.
*Pronto quando:* a planta abre sem sinal com os postes que já tinham sido lidos.

### 7.2. Consertar (existe e não funciona)

**R1. Geometria da prancha divergente.** ✅ feita em 10 set 2026. Ver 10.1 e E4. Ver **Rebaixado pelo modelo novo**: deixou de ser erro
de dado (o campo não produz mais coordenada) e virou erro de desenho. Ainda precisa ser consertado,
porque o anel cinza tem que cair sobre o símbolo de poste da prancha; se estiver deslocado, o gerente
toca no lugar errado da rua. Conserto igual: gravar `plan_geometry` no snapshot durante a importação
e os dois lados lerem dali.
*Pronto quando:* o anel cinza cai sobre o símbolo do poste na prancha, nos dois lados.

**R2. Retentativa de foto travada.** O bucket não tem policy de UPDATE, então foto que cai no meio do
upload trava para sempre e a única saída na tela é Descartar.
*Pronto quando:* subir a mesma foto duas vezes funciona.

**R3. Senha temporária não obrigada.** O portal cria o gerente mas não seta `must_change_password`.
*Pronto quando:* o gerente novo é obrigado a trocar no primeiro acesso.

**R4. Consulta que engole erro.** O padrão `if (error) return []` transforma falha de rede em tela
vazia. Corrigido na planta, ainda presente em outras telas, por exemplo `equipe.tsx:33`.
*Pronto quando:* nenhuma tela do APK afirma "nenhum registro" quando o que houve foi erro.

### 7.3. Refatorar (existe e muda de forma)

**F1. Navegação do portal.** Nove abas viram quatro, a obra abre no canvas, impedimento vira faixa.
**F2. Home do portal.** `getWorkPendingApprovals` e `categorizeWorks` classificam por diário pendente
e checklist devolvido, que somem. Critério novo: impedimento aberto, marco aguardando, silêncio.
**F3. Cabeçalho da obra.** Os quatro números passam a ser postes, metros de rede, marcos e último
registro.
**F4. Navegação do APK.** A obra abre na planta. Registrar perde Diário e Checklist, e ganha dois
caminhos para equipamento: pela ficha do poste e pela folha do +.
**F5. `registros.tsx` vira a aba Dia.** Passa a ler equipamento e rede, deixa de listar diários, e
ganha os três números do topo.
**F6. Deep links e gatilhos.** `/diario` e `/checklists` ficam órfãos no APK enquanto o banco ainda
gera notificação apontando para eles.
**F7. Fila offline.** Handlers de checklist, checklist-status e daily-log dormem.

### 7.4. Dormir (sai da navegação, código fica)

Checklists (portal e APK, templates inclusos), formulário de diário e fluxo de aprovação, equipe e
presença, galeria, documentos, curva S.

Nada é apagado. As rotas somem, o código e as tabelas ficam onde estão. Se algo voltar, volta sem
arqueologia.

---

## 8. O que está em aberto

Fechado em 10 set 2026: o orçamento manda sempre; poste fora do projeto só o engenheiro cria;
equipamento tem dois caminhos; a sincronia roda por gatilho em `budget_posts`; poste verde apagado
do orçamento fica e é contado como divergência.

| # | Questão | Situação |
| --- | --- | --- |
| **A1** | "O projeto previa e ainda não subiu", na ficha do poste | **Falta dado.** A lista de estruturas previstas por poste vive em `post_item_groups`, no orçamento, e não é copiada para a obra. Copiar isso é uma etapa em si, e vale decidir se entra antes ou depois do piloto. |
| **A2** | Poste verde apagado do orçamento | A sincronia já o preserva e conta como divergência. Falta desenhar como o portal **mostra** isso: hoje ele aparece como um poste normal. |
| **A3** | Estruturas previstas mudam depois do equipamento registrado | Recomendo não mexer no registrado e mostrar a diferença. Depende de A1. |
| **A4** | O que a conversa mostra de contexto | Os chips de registro no fio continuam sendo palpite meu, e ainda não foram construídos. |
| **A5** | Engenheiro vê todas as obras da organização? | Aberta desde 14 ago. Confirmar como intencional e registrar aqui. |
| **A6** | Legenda do canvas do portal | Cabo lançado e vão previsto se distinguem pela forma, mas não há legenda dizendo isso. Polimento. |

## 9. Como trabalhamos, e a fila

### 9.0. O ritmo

Cinco regras que valem para toda etapa. Elas existem para o trabalho não voltar atrás.

1. **Uma etapa por vez, numa branch por etapa** (`campo/etapa-N-nome`), com commits legíveis: o
   assunto diz o que mudou para quem usa, o corpo diz por quê. Os nove commits de 10 set 2026 são o
   padrão.
2. **Toda entrega minha fecha com três coisas**: `tsc` limpo, testes passando, e **este documento
   atualizado na mesma leva**. Entrega que não atualiza o documento não está pronta.
3. **Toda etapa termina com uma verificação sua**, curta e concreta, descrita antes de eu começar.
   Não termina com eu dizendo "pronto".
4. **Nada vai para produção sem rodar em dev** com o `gerente@teste.orcarede` e um aparelho de
   verdade.
5. **Decisão nova para a etapa**, vira pergunta, não palpite meu. Eu entrego o resto da etapa e
   deixo o ponto marcado na seção 8.

**O que roda em paralelo.** Você é o gargalo em três momentos (E1, E9, E10) e não deveria ser em
nenhum outro. Então enquanto uma etapa sua está aberta, eu pego a etapa seguinte que **não** depende
da sua resposta. As dependências estão marcadas em cada etapa abaixo.

---

### E0 · Commitar o que existe ✅

**Feito em 10 set 2026.** Nove commits na `redesenho/campo`. Achado no caminho: `.env.prod-bak` com
chave real estava fora do `.gitignore`.

---

### E1 · Os postes do projeto caem sobre a prancha? ✅ caem

**Respondida em 10 set 2026, no código, sem depender de inspeção manual.**

Baixei a prancha do dev, renderizei com poppler e sobrepus os postes usando a mesma fórmula do
portal. Testei três hipóteses geométricas na obra do dev e **todas falharam**: o quadro rotacionado
(o que o portal usa), o mesmo espelhado em Y, e o quadro em retrato (a hipótese de a rotação não
estar sendo aplicada em algum ponto).

A causa era outra, e mais simples: **`work_project_snapshot.source_budget_id` da obra do dev é
nulo.** Ela nunca foi importada de orçamento nenhum. Os nove postes são dado de teste fabricado, e o
PDF é de um projeto que não tem relação com eles. Era isso que eu tinha visto em setembro e
registrado como "espelhamento em Y sem prova": não havia bug, havia dado falso.

Contra orçamento real, o resultado é o oposto:

| Orçamento | Prancha | Postes | Resultado |
| --- | --- | --- | --- |
| `a179d3bc`, ago/2026, `render_version 2` | A0 paisagem, `/Rotate 270` | 150 | **caem em cima do desenho**, seguindo as curvas das ruas do condomínio |
| `76f1b51b`, nov/2025, `render_version 1` | A1 paisagem, `/Rotate 0` | 227 | **caem em cima dos símbolos de poste**, ao longo de cada quadra |

**Conclusão: o modelo "toque no poste cinza" é viável.** A fórmula de coordenada do portal está
certa nas duas versões de render, e o posicionamento no orçamento é preciso, não aproximado.

**O que isto muda no plano:** a obra do dev não serve para validar nada. Antes da E9 é preciso
**importar em dev uma obra a partir de um orçamento real**, senão o ciclo ponta a ponta roda contra
uma planta que não corresponde aos postes.

**O que continua valendo:** a R1 segue no catálogo. Ela não é sobre o orçamento, é sobre o APK
derivar o tamanho da página do que o Android reporta (pixels da view) em vez de pontos. Sem
`plan_geometry` gravada no import, o anel cinza é desenhado no lugar errado **no aparelho**, mesmo
com o orçamento correto.

### E2 · A sincronia do orçamento ✅

**Feita em 10 set 2026.** As quatro regras de 1.4 estão no ar, e cada uma foi testada no dev antes
de subir para produção.

**Onde ela vive, e por quê.** No banco. O orçamento é editado direto do navegador, sem passar por
Server Action, então não existe ponto na aplicação onde pendurar isso de forma confiável. O gatilho
fica em `budget_posts`, statement-level com tabelas de transição, então um arrasto que reposiciona
vinte postes vira **uma** sincronia, não vinte. E começa checando se existe obra vinculada, que é
falso para a esmagadora maioria dos orçamentos.

**Uma implementação só.** A conversão "poste de orçamento vira poste de obra" virou
`sync_work_project_from_budget`, e a importação chama ela também. Antes era `buildPostRow` em
TypeScript, e a sincronia precisaria repetir a mesma regra em SQL: duas implementações da mesma
conta divergem com o tempo, e divergir aqui move poste de lugar.

**O que foi testado:** primeira sincronia traz tudo; rodar de novo não muda nada; mover um poste no
orçamento atualiza exatamente um; apagar um poste cinza remove; apagar um poste **verde** não
remove, e ele passa a ser contado como divergência; acrescentar no orçamento faz o poste descer para
a obra sem ninguém chamar nada.

**Rastro.** Mudança de projeto embaixo de obra em execução avisa o gerente. Ficou como gatilho
próprio em `work_project_posts`, e não dentro da sincronia, para pegar qualquer mudança venha de
onde vier. Só avisa depois do primeiro poste levantado, senão uma importação de 280 postes viraria
280 avisos.

**Planta em imagem raster** ganhou a transformada gravada no `plan_geometry`, senão poste que
chegasse depois cairia num sistema de coordenadas diferente dos que já estavam lá.

---

### E3 · O vínculo e a ficha do poste ✅

**Feita em 10 set 2026.**

`work_pole_installations.project_post_id` liga o executado ao projetado, com um índice único parcial
que garante **um poste de projeto de pé uma vez só**. Poste removido não ocupa a vaga: o gerente
pode ter derrubado e levantado de novo, e isso é execução real.

A RPC deixou de aceitar a coordenada que o campo mandar. Recebe o `project_post_id` e **copia** x, y,
numeração e tipo do projeto. O aparelho nem precisa saber calcular quadro lógico, e a divergência
entre os dois lados deixa de ter por onde acontecer.

No app, tocar num poste cinza abre a ficha com o que o projeto prevê ali e um botão só. Tocar no
vazio não faz mais nada: o poste fantasma acabou junto com o toque livre. Poste já aceso sai do
cinza, senão o verde e o cinza ficariam empilhados no mesmo ponto.

### E4 · Geometria da prancha e migration em produção ✅

**Feita em 10 set 2026.**

**R1, a geometria.** A conta de onde a planta fica dentro do quadro 6000x6000
passou a ser feita uma vez, no servidor, durante a importação, e gravada em
`work_project_snapshot.plan_geometry`. Os dois lados leem dali.

- `src/lib/canvas/planFrame.ts` virou a única implementação. O
  `calculatePdfPageDimensions` do portal delega para ela: não há mais como as duas
  divergirem sem ninguém notar.
- `src/lib/canvas/pdfPageGeometry.ts` lê a página com `pdf-lib`, que já era
  dependência e aguenta PDF com object stream. Devolve a página **exibida**, com
  a rotação aplicada, igual ao `getViewport` do pdf.js. Conferido contra o
  poppler em três pranchas reais.
- No APK, `planFrame` ganhou um quarto argumento e prefere a geometria gravada.
  Geometria pela metade é descartada em vez de usada torta.
- Prancha ilegível não derruba a importação: fica nulo e o aparelho cai no
  caminho antigo.
- De brinde: `pdf_num_pages` deixa de ser sempre nulo. A variável existia desde o
  início e nunca era atribuída.

**C3, a migration.** Em produção agora existem as cinco tabelas de equipamento e
rede, as duas RPCs (`SECURITY DEFINER`, `authenticated` e `service_role`, igual às
outras oito do módulo), as dez policies de RLS, e duas policies de storage novas
para `{work_id}/pole-equipment/` e `{work_id}/network-spans/`. Dev e produção
estão em paridade. Os advisors de segurança não acusaram nada novo.

**O que ficou de fora, e por quê.** Os gatilhos de notificação de equipamento e
trecho (C7) não foram criados: eles precisam apontar para uma tela do portal que
ainda não existe. Vão junto com a E7.

**Verificação:** `tsc` limpo nos dois repositórios, 124 testes passando no APK,
e a sobreposição visual dos postes sobre a prancha em dois orçamentos reais.

### E5 · A navegação nova dos dois lados ✅

**Feita em 10 set 2026.**

**Portal.** Nove abas viram três: Obra, Conversa e Marcos. Alertas sai da aba e vira faixa no topo,
acima do cabeçalho, com texto próprio para `resolved_in_field`, senão o encerramento formal nunca
acontece. Os quatro números passam a ser postes de pé, metros de rede lançados (quebrados por BT, MT
e IP), marcos, e data do último registro. Na home, a urgência deixa de sair de diário pendente e
checklist devolvido: vermelho é impedimento `critical` ou `high`, amarelo é marco aguardando ou
impedimento leve. O cartão ganha o sinal de silêncio, que aparece em âmbar quando uma obra em
execução passa dois dias sem registro.

**APK.** A obra abre na planta, não num painel de números. O painel tinha quatro coisas e cada uma
foi para um lugar: os números viraram cabeçalho da planta, o diário do dia virou a aba Dia, o marco
segue na folha Registrar, e o impedimento aberto virou faixa vermelha no topo da planta, espelhando
o portal. `/obra/{id}` continua existindo como redirecionamento, para não quebrar deep link nem
histórico. A folha Registrar perde Diário e Checklist, e os dois caminhos saem da lista de deep
links válidos: o banco ainda gera notificação apontando para eles, e link velho passa a cair na
home.

**Uma peça nova, que serve a duas etapas.** `getWorkExecutionStats` lê as três origens de execução
em batch e devolve metragem por categoria e data do último registro. Ele **não** usa
`works.last_activity_at`, porque aquele campo também anda quando chega mensagem: uma obra pode estar
cheia de conversa e parada há uma semana. É ele que alimenta o cabeçalho, o sinal de silêncio e,
na E6, o dia automático.

**Adiado de propósito:** a aba Dia a dia entra junto com a tela dela, na E6. Aba que leva a lugar
nenhum é pior que aba a menos.

**Verificação:** `tsc` limpo nos dois repositórios, 123 testes passando, eslint sem erro novo. Os
dois erros de eslint que aparecem em `WorkCanvas.tsx` são anteriores a esta etapa.

### E6 · O dia automático ✅

**Feita em 10 set 2026.**

**Portal.** Aba Dia a dia nova, servida por `getWorkDays`: coluna de dias à esquerda, e no dia
aberto quatro números, a linha do dia hora a hora e a grade de fotos. Nenhuma aprovação, nenhum
campo de texto. Registro que passou pela fila mostra as duas horas, com a de chegada em âmbar.
Botão de imprimir, porque cliente pede relatório.

**APK.** A aba Dia passa a ler equipamento e trecho, deixa de listar diário, e ganha três números do
dia de hoje no topo. Os filtros viram Tudo, Postes, Equipamento, Rede e Na fila.

**A regra que sustenta as duas telas:** agrupar por `installed_at`, a hora do aparelho, e cortar o
dia à meia-noite em `America/Sao_Paulo`. Sem a primeira, um poste levantado às 16h38 sem sinal cairia
no dia em que o servidor o recebeu. Sem a segunda, todo registro feito depois das 21h cairia no dia
seguinte.

**Detalhes que valem lembrar:** só as fotos do dia aberto são assinadas, senão uma obra com meses de
execução pagaria centenas de assinaturas para mostrar uma grade de nove. E a leitura lança em vez de
devolver lista vazia: "não consegui ler" é diferente de "o campo não trabalhou", e a segunda é uma
acusação.

**Verificação:** `tsc` limpo nos dois repositórios, 123 testes passando, eslint sem aviso novo.

### E7 · Equipamento e rede no portal ✅

**Feita em 10 set 2026.**

No canvas, o vão previsto continua tracejado e translúcido, e o cabo lançado desenha por cima, cheio
e opaco. Diferença de forma, não só de cor. Trecho lançado fora do projeto, que pode não ter as duas
pontas em `work_project_posts`, some do canvas em silêncio em vez de virar linha inventada; ele
continua no dia a dia, com metragem.

Na ficha do poste entra "montado neste poste", com quantidade, e o que veio de fora do projeto ganha
selo âmbar, porque é divergência entre projeto e execução.

Os dois gatilhos de notificação que ficaram de fora na E4 entraram, apontando para o dia a dia.

**Fica em aberto, por falta de dado:** "o projeto previa e ainda não subiu". A lista de estruturas
previstas por poste vive no orçamento (`post_item_groups`) e não é copiada para a obra. Preferi
deixar o vão explícito a inventar uma lista.

---

### E8 · Os consertos ✅

**Feita em 10 set 2026.**

- **Áudio e vídeo tocam no chat.** Só a imagem pedia URL assinada, então o áudio nunca teve como
  tocar. `expo-av` já era dependência e não era usado.
- **A planta abre com os postes sem sinal.** A prancha tinha cache local, as marcações não.
- **Policy de UPDATE no bucket**, que destrava a retentativa de foto. Mesmo predicado das de INSERT.
- **`must_change_password`** na criação do gerente: a senha temporária deixa de virar definitiva.
- **Erro de leitura deixa de virar tela vazia** em mais três lugares: equipe, materiais previstos do
  poste, e equipe do diário.

---

### E9 · O ciclo ponta a ponta 🔴 em andamento

**Sem aparelho físico: roda no emulador do Android Studio.** O roteiro e os resultados de cada
rodada ficam em `docs/testes-campo.md`, que é registro de execução, não plano.

A obra de teste foi montada em 10 set 2026 a partir de uma **cópia** de orçamento real (Weissberg
II, 52 postes, prancha A1 sem rotação). A cópia existe porque a sincronia é um dos testes, e ela
precisa poder acrescentar e apagar postes sem mexer no projeto de ninguém.

### E9 (roteiro original) · O ciclo ponta a ponta, com aparelho 🔴

**Objetivo:** a primeira vez que o caminho completo roda contra dado real.
**Depende de:** E2 a E8.

O roteiro está logo abaixo. **É a etapa mais importante do plano** e a única que eu não posso fazer
sozinho.

**Meu tempo:** plantão. **Seu:** 2 a 3 h, uma vez.

---

### E10 · Piloto

Uma obra, um gerente de verdade, uma semana de uso normal. Só depois disso as dívidas de polimento
que estão dormindo no arquivo morto voltam a valer discussão, porque só aí você sabe quais delas
alguém sente falta.

---

### Resumo do seu tempo

| Etapa | Seu tempo | Natureza |
| --- | --- | --- |
| E1 | ~~30 min~~ | ✅ resolvida no código |
| E2 | 1 h | sessão de desenho e verificação |
| E3 a E8 | ~2,5 h somadas | verificações curtas |
| E9 | 2 a 3 h | o ciclo com aparelho |
| E10 | uma semana | acompanhar |

Cerca de **7 horas suas** até o piloto.

### O roteiro da E9

Em dev, com `gerente@teste.orcarede`, num Android real, com o portal aberto do lado:

1. Acender um poste cinza com foto. Conferir no canvas do portal se é o mesmo poste.
2. Montar equipamento nesse poste, pelos dois caminhos. Ver aparecer na ficha do poste no portal.
3. Lançar um trecho entre dois postes. Ver a metragem somar no dia e no marco.
4. Trocar mensagem nos dois sentidos, com foto e com áudio.
5. Abrir impedimento, resolver em campo, encerrar pelo portal.
6. **Modo avião:** repetir 1, 3 e 4 sem rede, religar e ver a fila drenar.
7. Acrescentar um poste no orçamento e ver ele chegar cinza no aparelho.
8. Conferir que o dia de hoje no portal bate com o que foi feito, sem ninguém ter escrito nada.

---

## 10. Achados que custaram investigação

Coisa medida, não opinião. Detalhe em `docs/_arquivo/plano-planta-e-postes-apk.md`.

### 10.1. O poste pode cair 77 m fora do lugar

A prancha tem `/Rotate 270`. O portal recebe o tamanho da página em pontos, já rotacionado; o
Android entrega o tamanho da view em pixels, 1,66× maior. Os dois lados montam quadros lógicos
diferentes a partir da mesma fórmula, e o erro cresce com a distância do centro. Numa prancha 1:1000
de 59,4 cm, 13% de erro são 77 metros. Atinge obras em `render_version 1`.

**Rebaixado em 10 set 2026.** Com o campo deixando de produzir coordenada (1.4), isto para de ser
erro de dado e vira erro de desenho: o anel cinza pode cair deslocado do símbolo na prancha. Continua
no catálogo como R1, com urgência menor e o mesmo conserto.

### 10.2. A planta borra da metade para baixo

O `react-native-pdf` tem teto fixo de cerca de 120 ladrilhos, ou 7,2 megapixels, seja qual for o
aparelho. Acima disso, o excedente vem esticado de um thumbnail. Medido em emulador. Paliativo já
aplicado: o fator de rasterização é calculado em runtime para caber no orçamento. Prancha em retrato
é bem pior que em paisagem.

### 10.3. A presença nunca era registrada

O APK gravava nomes em `crew_present`, o gatilho esperava id de ficha e engolia o erro como aviso, e
o portal só mostrava a contagem. Corrigido em 10 set 2026 (`member.id` no lugar de `member.name`,
mais a tradução na leitura). Com Equipe dormindo, o conserto fica guardado para quando voltar.

### 10.4. Falha de leitura desenhada como "nenhum registro"

Consultas caindo em `data ?? []` transformavam erro de rede em tela vazia afirmada com confiança.
Corrigido na planta, ainda presente em outras telas.

---

## 11. Como manter este documento

- Toda entrega que muda o sistema muda este arquivo, na mesma leva.
- Decisão tomada sai da seção 8 e vira comportamento descrito nas seções 3 a 6, com a data.
- Item do catálogo (seção 7) que fica pronto sai do catálogo e vira descrição de tela.
- Achado que custou medição vai para a seção 10, curto, com ponteiro para o detalhe.
