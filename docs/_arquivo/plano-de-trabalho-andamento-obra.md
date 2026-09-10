# Andamento de Obra e APK: plano de trabalho

> Documento de organização. Escrito em 9 set 2026, a partir do escopo original
> (`Modulo_Andamento_de_Obra_Escopo.md`, maio/2026), do diagnóstico de retomada
> (`docs/andamento-obra-decisoes-arquitetura.md`, 14 ago 2026), de leitura de código nos dois
> repositórios e de consulta ao vivo aos bancos de dev e de produção.
>
> Existe porque o trabalho está espalhado: parte no portal, parte no APK, parte em decisão não
> tomada, parte em teste que só o Paulo pode fazer. Este arquivo é o lugar onde isso vira uma fila.

**Status:** proposto, aguardando as decisões da seção 3.

---

## 1. Onde o projeto está, de verdade

O módulo tem três camadas, e elas estão em estágios muito diferentes.

| Camada | Estado |
| --- | --- |
| Portal web (engenheiro) | **Completo conforme o escopo de maio.** As 9 abas existem, mais Pessoas, templates de checklist, central de notificações e painel admin. |
| APK (gerente) | **Construído além do escopo.** Os 10 blocos do `APK_SCOPE` existem, mais três coisas que o escopo não previa: navegação redesenhada, equipamento no poste e trecho de rede. |
| Uso real | **Zero.** Produção tem 5 obras, nenhum snapshot de projeto, nenhum gerente, nenhum registro de campo. |

O achado central do diagnóstico de 14 de agosto era: *"o caminho completo do APK nunca rodou contra
dado real"*. Vinte e seis dias depois, os números de produção estão idênticos: 0 gerentes, 0
vínculos, 0 crew, 0 tokens de push, 0 diários, 0 postes, 0 alertas.

**É esse o desalinhamento, e ele explica a sensação de bagunça.** O roteiro de agosto pedia trabalho
"para dentro": fechar o modelo de acesso, rodar o ciclo ponta a ponta uma vez, reconciliar a
documentação. O que aconteceu desde então foi trabalho "para frente": diagnóstico e conserto da
planta, equipamento, rede, redesenho da navegação. Trabalho bom, todo ele, e nenhum deles avança a
fase 1 do roteiro que você mesmo aprovou.

O ambiente de dev conta a mesma história em miniatura: 1 gerente, 1 obra vinculada, 9 postes
marcados, e **zero** de tudo o mais. Chat, diário, checklist, alerta, presença e push nunca foram
exercitados nem em dev.

### 1.1. O que está fora de commit

O repositório do APK tem 43 arquivos modificados e 20 novos sem commit, cerca de 2.200 linhas.
Último commit é de maio. Tudo o que veio depois (Fase 0 da planta, navegação nova, equipamento,
rede, registros) existe só no disco desta máquina. `tsc` limpo, 120 testes passando, mas fora do
git.

Isso já tinha sido apontado em 14 de agosto, com 13 arquivos. Hoje são 63.

### 1.2. A regra travada que foi quebrada

O escopo de maio tem um princípio de design explícito:

> **Web 100% funcional antes do APK.** Toda lógica e UX validada no portal primeiro.

Equipamento e rede furaram isso. Existem no APK, existem no banco de dev, e **não existem no portal
web**: nenhum arquivo em `src/` menciona `work_pole_equipment` ou `work_network_spans`. Também não
existem em produção. Hoje o gerente registraria o equipamento que subiu e o cabo que lançou, e o
engenheiro não teria onde ver.

Não é para desfazer. É para fechar, e é a etapa 5 deste plano.

---

## 2. O mapa do que existe

### 2.1. Portal web

| Aba | Estado |
| --- | --- |
| Visão Geral (canvas read-only) | pronta |
| Chat | pronta |
| Diário + aprovação | pronta |
| Progresso | pronta |
| Equipe | pronta |
| Checklists | pronta |
| Alertas | pronta |
| Galeria | pronta |
| Documentos | pronta |
| Pessoas (gerentes + crew) | pronta |
| Notificações | pronta |

Nunca recebeu um único dado vindo do APK.

### 2.2. APK

| Fluxo | Estado |
| --- | --- |
| Login, troca de senha, sessão offline | pronto |
| Lista de obras, tela da obra | pronto |
| Chat + realtime + mídia | pronto, sem áudio (DEBT-019) e sem preview de vídeo (DEBT-020) |
| Postes na planta | Fase 0 do plano da planta feita, validada em emulador, **nunca em aparelho** |
| Diário | pronto |
| Marcos | pronto |
| Checklists | pronto |
| Alertas | pronto, sem filtros e sem mapa (DEBT-025, DEBT-026) |
| Push | app registra token; backend entrega por trigger em produção |
| Fila offline | 13 handlers, backoff, tela da fila, telemetria |
| Equipamento no poste | tela e handler prontos, **só existe em dev**, sem portal |
| Trecho de rede | idem |
| Registros (linha do tempo) | pronta, mas lê só postes, diários, alertas e marcos |
| **Presença diária** | **não existe.** A tela de Equipe é só leitura. O escopo previa o gerente marcando presença. |

---

## 3. O que não está definido

Esta seção é o motivo de o trabalho travar sozinho. São nove pontos, todos precisam de uma
resposta sua, todos com recomendação minha. Uma sentada resolve.

### D1. Onde o engenheiro vê equipamento e rede

Não estava no escopo de maio, então não tem lugar reservado no portal.

**Recomendo:** rede entra em **Progresso**, porque `work_network_spans` já guarda `meters` e
`meters_planned` por categoria, que é exatamente o "metragem por categoria (BT/MT), planejado vs
realizado" que o escopo pede e hoje é preenchido a mão. Equipamento entra no **painel do pin**, na
Visão Geral: clicar no poste abre a ficha com o que foi montado nele, que já é o comportamento
desenhado no escopo ("clique em pin abre painel lateral com foto, GPS, data, observações,
histórico"). Nenhuma aba nova.

### D2. Poste instalado é pareado com poste de projeto, ou é livre?

Hoje é livre: `work_pole_installations` não tem coluna que aponte para `work_project_posts`. O
escopo travou isso de propósito ("marcação de postes é livre no PDF, sem validação contra o
snapshot"). Mas o APK já mostra "X de 9 postes" no cabeçalho da planta, o que sugere pareamento sem
ter pareamento, e a Fase 3 da planta (modo marcar) empurra ainda mais nessa direção.

**Recomendo:** manter livre e **parear opcionalmente**. Uma coluna `project_post_id` nullable, e no
momento de marcar, se houver poste planejado dentro do raio, o app pergunta "é este?". Sem isso o
% de execução da obra nunca é confiável, porque conta duas listas que ninguém garante que são a
mesma. É uma decisão que muda banco, APK e Progresso, então precisa ser tomada antes da etapa 5.

### D3. Presença diária

O escopo previa o gerente marcando presença do dia no APK, alimentando
`work_team_attendance`, que o portal consolida na aba Equipe. Não foi implementado.

Depende da D4: sem crew cadastrado, não há em quem marcar presença.

**Recomendo:** implementar, mas só depois do primeiro ciclo ponta a ponta. É a menos urgente das
lacunas porque não bloqueia nada.

### D4. Como o gerente enxerga `crew_members` (decisão 5.1, aberta desde 14 ago)

Três opções estão registradas no documento de agosto. Nenhuma foi escolhida. Consequência prática:
`crew_members` está com zero linhas nos **dois** ambientes, e a aba Equipe do APK nunca mostrou
ninguém.

**Recomendo a opção B**, policy alternativa em `crew_members` aceitando `is_work_member()` via
`work_team`. É a que mantém o princípio original ("gerente só vê a obra onde está alocado") e não
coloca o gerente dentro de `org_members`, o que lhe daria acesso a coisas que o escopo diz que ele
não pode ver.

### D5. Visibilidade de obras por organização (decisão 5.2, aberta desde 14 ago)

Hoje qualquer engenheiro da organização vê todas as obras da organização. O escopo de maio dizia
"engenheiro vê apenas suas obras". Precisa confirmar qual dos dois é o certo hoje, porque a reforma
de organizações de agosto mudou a premissa e ninguém carimbou a mudança.

**Recomendo:** confirmar o comportamento atual como intencional e atualizar o escopo, se a ideia é
que a On Engenharia seja uma organização com engenheiros que se cobrem. Se não for, é migration.

### D6. Política de UPDATE no bucket `andamento-obra`

Já detalhada em `plano-planta-e-postes-apk.md` seção 2.10. Você respondeu "decidir depois" hoje.
Registro o custo de adiar: foto que cai no meio do upload trava para sempre na fila do gerente, e
a única saída na tela é Descartar. Vai aparecer no primeiro dia de campo com sinal ruim.

**Recomendo:** decidir junto com a etapa 4, não antes.

### D7. Coordenada de obra em `render_version 1`

Seção 2.8 do mesmo documento. Poste marcado no campo pode cair até 77 m fora do lugar no portal.
Atinge só obras `render_version 1`, que é exatamente a única obra do dev, e nenhuma de produção
(produção não tem snapshot nenhum).

**Recomendo:** fazer só o item 6 da Fase 1 (gravar `plan_geometry` no snapshot no import), que
destrava isso sem puxar a pirâmide de ladrilhos que você decidiu segurar. São coisas separadas.

### D8. Galeria e as origens novas

O escopo diz que a Galeria agrega mídia de todas as origens. Equipamento e rede têm tabela de mídia
irmã e não estão na Galeria.

**Recomendo:** incluir, junto com a etapa 5. É consulta a mais, não desenho novo.

### D9. Documentação desatualizada

`APK_SCOPE.md` descreve um hub com 6 botões grandes. O APK hoje tem 4 abas e uma folha de
Registrar. Os 16 contratos em `docs/apk-contracts/` descrevem o modelo de acesso de antes da
reforma de organizações e não conhecem equipamento nem rede.

**Recomendo:** reconciliar na etapa 0 o que é barato (navegação, contratos de equipamento e rede) e
deixar o resto para depois do primeiro ciclo, quando a realidade vai ter mudado de novo.

---

## 4. O plano

Sete etapas. O princípio que ordena tudo: **fechar o ciclo ponta a ponta antes de acrescentar
superfície nova.** Cada etapa diz quem faz, quanto custa do seu tempo, e como se sabe que acabou.

Os tempos "meu" são de trabalho de máquina. Os tempos "seu" são os que importam para o seu
calendário: são horas suas, com o celular ou o portal na mão.

### Etapa 0: arrumar a casa

**Meu:** 2 a 3 horas. **Seu:** nada.

- Commitar as 2.200 linhas em blocos separados e legíveis: Fase 0 da planta, navegação nova,
  equipamento e rede, mídia pendente.
- Atualizar `APK_SCOPE.md` na parte de navegação, e escrever o contrato novo de equipamento e rede
  em `docs/apk-contracts/`.
- Registrar em `known-debt.md` o que a avaliação de hoje achou e ainda não estava lá.

**Pronto quando:** `git status` limpo no APK e a documentação não mente sobre a navegação.

### Etapa 1: as nove decisões

**Meu:** nada, já estão escritas acima. **Seu:** 1 hora.

Ler a seção 3 e responder os nove pontos. Se concordar com todas as recomendações, é uma frase.

**Pronto quando:** a seção 3 vira registro datado de decisão em vez de lista de pergunta.

### Etapa 2: fechar pessoas e acesso

**Meu:** meio dia. **Seu:** 1 hora.

É a Fase 1 do roteiro de agosto, parada há 26 dias.

- Aplicar a decisão D4 (policy de `crew_members`) e a D5 (visibilidade de obras).
- Corrigir DEBT-018 (`must_change_password` não setado pelo web).
- Cadastrar em **produção** o primeiro gerente real e uma equipe de verdade, pelo portal.
- Reescrever a matriz de RLS em `security-audit.md` e executá-la contra o par engenheiro/gerente
  real, não só documentá-la.

**Seu trabalho aqui:** cadastrar o gerente e a crew pelo portal, e tentar acessar, com a conta dele,
uma obra onde ele não está alocado. Se aparecer, é falha de RLS e para tudo.

**Pronto quando:** o gerente loga no APK apontando para produção e vê exatamente uma obra.

### Etapa 3: primeiro ciclo ponta a ponta, com aparelho na mão

**Meu:** escrever o roteiro de teste, 2 horas, e ficar de plantão. **Seu:** 2 a 3 horas, uma vez.

Esta é a etapa que o projeto inteiro está esperando desde maio. É em **dev**, com
`gerente@teste.orcarede`, num celular Android de verdade, não em emulador.

Os sete fluxos, uma vez cada, com o portal aberto do lado para conferir a chegada:

1. Marcar um poste com foto e GPS. Conferir no canvas do portal se caiu no lugar certo.
2. Publicar um diário. Rejeitar pelo portal. Ver a rejeição chegar por push. Republicar.
3. Trocar mensagem nos dois sentidos, com foto.
4. Marcar itens de um checklist com foto. Validar pelo portal.
5. Abrir um alerta, resolver em campo, encerrar pelo portal.
6. Reportar um marco, aprovar pelo portal.
7. **Modo avião**: repetir os fluxos 1, 3 e 5 sem rede, e depois ligar a rede e ver a fila drenar.

Ao mesmo tempo isso mede o M1 da Fase 0 da planta (a planta borra? o zoom volta sozinho? o pino
tem tamanho de dedo?), que é a validação em aparelho que está pendente desde 3 de setembro.

**Pronto quando:** os sete fluxos rodaram e a lista de defeitos existe. Se rodarem todos limpos, é
a primeira vez na vida do projeto.

### Etapa 4: consertar o que a etapa 3 revelar

**Meu:** 1 a 2 dias, dependendo do achado. **Seu:** 30 minutos de reteste.

Já sei de três coisas que entram aqui, independentemente do que o campo mostrar:

- D7: gravar `plan_geometry` no import, que destrava a coordenada de obra legada.
- D6: a política de UPDATE no bucket, que destrava retentativa de foto.
- Cache offline das marcações (item 9b do plano da planta): hoje a planta abre sem sinal, mas os
  postes somem, o que é a pior assimetria possível num app offline-first.

### Etapa 5: fechar equipamento e rede

**Meu:** 1 a 2 dias. **Seu:** 1 hora de teste.

- Migration das cinco tabelas e das duas RPCs em produção.
- Portal lendo as duas coisas, conforme a decisão D1.
- Linha do tempo de Registros no APK incluindo as duas origens, que hoje não inclui.
- Galeria incluindo as mídias novas (D8).
- Se a D2 for "parear", a coluna `project_post_id` entra aqui.

**Pronto quando:** o gerente registra equipamento e trecho no aparelho e você vê os dois no portal.

### Etapa 6: modo ver e modo marcar na planta

**Meu:** 1 dia. **Seu:** 30 minutos, testando de luva.

Fase 3 do plano da planta. Hoje um toque no vazio abre a folha de novo poste direto, sem
confirmação, o que em campo com luva vira poste fantasma.

### Etapa 7: piloto em obra real

**Meu:** plantão. **Seu:** acompanhar uma semana.

Uma obra, um gerente de verdade, uma semana de uso normal. Só depois disso as dívidas de polimento
(áudio no chat, preview de vídeo, filtros de alerta, rascunho de diário, presença diária) valem a
pena, porque só aí você vai saber quais delas o gerente sente falta de verdade.

---

## 5. Resumo do seu tempo

| Etapa | Seu tempo | Quando |
| --- | --- | --- |
| 1. Decisões | 1 h | agora, destrava tudo |
| 2. Pessoas e acesso | 1 h | depois que eu aplicar |
| 3. Ciclo ponta a ponta | 2 a 3 h | a etapa mais importante do plano |
| 4. Reteste | 30 min | |
| 5. Equipamento e rede | 1 h | |
| 6. Planta com luva | 30 min | |
| 7. Piloto | 1 semana de acompanhamento | |

Cerca de **6 horas suas** até o módulo estar validado ponta a ponta, mais a semana de piloto.

---

## 6. O que este plano deliberadamente não faz

- **Não retoma a pirâmide de ladrilhos** (Fases 1 e 2 do plano da planta). Você segurou hoje, e o
  paliativo da Fase 0 já deixa a planta nítida por inteiro. O item 6 daquela fase entra sozinho,
  porque ele é conserto de coordenada, não de nitidez.
- **Não mexe nas 13 dívidas do `known-debt.md`** antes do piloto, pelo motivo da etapa 7.
- **Não reescreve os 16 contratos** de uma vez. Reconciliar 3.000 linhas de documento com um sistema
  que ainda vai mudar na etapa 4 é trabalho jogado fora. Etapa 0 arruma o que já é certo, o resto
  espera o piloto.

---

## 7. Referências

- `Modulo_Andamento_de_Obra_Escopo.md` (maio/2026): escopo original do módulo
- `ApkOrcaRede/APK_SCOPE.md`: escopo do APK, com os 10 blocos
- `docs/andamento-obra-decisoes-arquitetura.md` (14 ago 2026): diagnóstico da retomada, decisões 5.1 e 5.2
- `docs/plano-planta-e-postes-apk.md` (2 set 2026): diagnóstico da planta, fases 0 a 4
- `docs/apk-contracts/`: 16 contratos web/APK
- `docs/known-debt.md` e `ApkOrcaRede/docs/known-debt.md`
- `docs/smoke-test-checklist.md`: smoke tests do portal, da fase 9.5
