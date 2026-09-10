# Testes de campo: roteiro e resultados

> Registro de execução, não plano. A fonte de verdade do módulo continua sendo
> `docs/andamento-obra.md`; este arquivo existe porque teste tem **resultado**, e
> resultado se acumula: cada rodada acrescenta uma linha em vez de reescrever.
>
> Tudo aqui roda em **dev**, contra a obra de teste da seção 1, no emulador do
> Android Studio. Nenhum teste toca produção.

**Criado em:** 10 set 2026
**Última rodada:** (nenhuma ainda)

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
| P2 | Emulador do Android Studio de pé | AVD iniciado e visível no `adb devices` | ⏳ |
| P3 | App rodando no emulador apontando para dev | Login abre | ⏳ |
| P4 | Portal rodando local apontando para dev | Lista de obras abre | ⏳ |

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
| A1 | Login com o gerente de teste | Entra; se a senha for temporária, obriga a troca | ⏳ |
| A2 | Lista de obras | A obra de teste aparece | ⏳ |
| A3 | Abrir a obra | Abre direto na planta | ⏳ |
| A4 | A planta | Prancha carrega; 52 anéis cinza sobre os símbolos de poste | ⏳ |
| A5 | Toque no vazio | Não acontece nada | ⏳ |
| A6 | Toque num poste cinza | Abre a ficha com tipo do projeto e "levantei este poste" | ⏳ |
| A7 | Levantar o poste | Pede foto; numeração e tipo já vêm preenchidos | ⏳ |
| A8 | Depois de salvar | O pino fica verde na hora, o cinza some, o contador do cabeçalho sobe | ⏳ |
| A9 | Tocar no mesmo poste de novo | É o poste levantado, não a ficha de levantar | ⏳ |
| A10 | Barra de baixo | Obra, Dia, Conversa, Equipe | ⏳ |
| A11 | Folha Registrar | Poste, Equipamento, Rede, Impedimento. Sem Diário e sem Checklist | ⏳ |
| A12 | Equipamento no poste levantado | Salva com estruturas marcadas | ⏳ |
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

_(vazio até a primeira rodada)_
