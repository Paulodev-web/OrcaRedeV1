# ESCOPO — REFATORAÇÃO ORÇAREDE E ESTEIRA DE PROJETO

> Status: planejamento aprovado, execução não iniciada
> Última atualização: 02/08/2026

---

## 1. Visão Geral

Refatoração do módulo OrçaRede (legado, migrado de SPA para Next.js sem reescrita) para transformá-lo em uma **esteira de projeto** contínua, no mesmo padrão de etapas sequenciais já usado no módulo de Suprimentos.

O fluxo passa a ser único, dentro de um mesmo orçamento:

```
Projeto (canvas + postes) → Materiais consolidados → Precificação → Proposta Comercial
                                                                          ↓
                                                              URL pública + PDF + analytics
```

Três mudanças estruturais acompanham a esteira:

1. **Base de navegação unificada** para todo o sistema (hoje há 4 padrões distintos convivendo)
2. **Extração das Configurações** de dentro do OrçaRede para uma área global do sistema
3. **Etapa nova de Proposta Comercial**, substituindo a montagem manual em ferramenta de design

---

## 2. Diagnóstico da Situação Atual

### 2.1. Roteamento fragmentado

| Módulo | Rota | Navegação |
|---|---|---|
| Portal | `/` (estado React) | Header próprio |
| OrçaRede | `/` (estado React) | Sidebar colapsável + `setCurrentView` |
| Portal do Engenheiro | `/` (estado React) | Header próprio, views em `useState` |
| Suprimentos | `/fornecedores/*` | `SuppliesHeader` repetido por página |
| Andamento de Obra | `/tools/andamento-obra/*` | `layout.tsx` + sub-nav + abas |
| Precificação | `/tools/precificacao/*` | Breadcrumb inline, sem layout |

`src/app/layout.tsx` contém apenas providers — **não existe chrome global**.

### 2.2. Design system parcial

Existem tokens de marca (`src/lib/branding.ts`, `@theme inline` em `globals.css`) com `navy #1D3140` e `blue #64ABDE`, mas mais de 100 arquivos escrevem os hex na mão. O OrçaRede legado opera fora da paleta, usando `blue-600` e `gray-*` do Tailwind.

### 2.3. Etapas desconectadas

- Orçamento termina na consolidação de materiais e no `finalize_budget`. Não há caminho para precificar.
- Precificação é módulo à parte; importa `budget_id` por select manual e termina em Excel.
- Proposta comercial **não existe no sistema** — é montada manualmente fora dele.

### 2.4. Configurações presas no módulo errado

Nove telas de catálogo (4.332 linhas) vivem dentro do OrçaRede, embora **nenhuma dependa de orçamento ativo**:

| Tela | Arquivo | Linhas |
|---|---|---|
| Hub | `Configuracoes.tsx` | 66 |
| Materiais | `GerenciarMateriais.tsx` | 903 |
| Subgrupos | `GerenciarMaterialSubgroups.tsx` | 316 |
| Concessionárias | `GerenciarConcessionarias.tsx` | 312 |
| Grupos de item | `GerenciarGrupos.tsx` | 308 |
| Editor de grupo | `EditorGrupo.tsx` | 892 |
| Tipos de poste | `GerenciarTiposPostes.tsx` | 469 |
| Padrões de poste | `GerenciarPadroesPoste.tsx` | 365 |
| Editor de padrão | `EditorPadraoPoste.tsx` | 701 |

---

## 3. Regras Invioláveis

Estas regras valem para toda a execução e não são negociáveis sem decisão explícita.

### 3.1. O canvas visual não é tocado na geometria

O canvas é HTML/CSS + SVG sobre `react-pdf`, num quadro lógico de 6000×6000. Ele **não** participa do cálculo de material, mas **é fonte de verdade espacial** para orçamento, Portal do Engenheiro, Andamento de Obra, APK e viewers públicos.

Proibido alterar sem validação nos cinco consumidores:

- `x_coord` / `y_coord` e sua escala
- `budgets.render_version` e a lógica condicional V1/V2
- `POST_CENTER_OFFSET` e offsets de hit-testing
- Qualquer arquivo em `src/lib/canvas/`
- `computeRasterCoordTransform` e a transformação raster → 6000

Permitido: reestilizar o chrome em volta (toolbar, painéis, cores, tipografia) e mover o componente para outra rota.

### 3.2. Migrations são entregues, não aplicadas

Toda mudança de banco vira arquivo versionado em `supabase/migrations/`. A aplicação é feita manualmente por Paulo, após backup.

### 3.3. Mudanças de banco são aditivas

Existe um APK Android (contratos em `docs/apk-contracts/`) que fala direto com o Supabase, sem passar pelo Next. Consequências:

- Não remover nem renomear colunas existentes
- Não alterar a semântica de `profiles.role` (o APK valida `role = 'manager'`)
- Colunas novas entram como `NULL` ou com default
- Permissões granulares entram em **camada nova**, sem mexer no CHECK de `profiles.role`

### 3.4. Produção não quebra

O sistema está em produção. Cada fase precisa ser deployável isoladamente, com o legado funcionando até a substituição ser validada em dev.

---

## 4. Restrições Técnicas

| Restrição | Impacto |
|---|---|
| **Vercel Hobby — 60s por invocação** | Já forçou a extração de PDF para Edge Function e o match semântico em lotes. Proíbe Puppeteer. Define a stack de PDF. |
| **Sem headless browser** | PDF não pode ser espelho renderizado da página web. |
| **`notifications` fora da publication Realtime** | O sino atual sobrevive de polling de 60s. Corrigir na Fase 1. |
| **`saved_pricing_budgets` com `UNIQUE (user_id, budget_id)`** | Impede cenários A/B. Migration obrigatória. |
| **`/api/generate-pdf` sem autenticação** | Endpoint aberto. Corrigir na Fase 0. |
| **DEBT-014** | 42 de 45 orçamentos no dev apontam para o Storage de produção. Resolver antes de testar a esteira. |

---

## 5. Base de Navegação e Design System

### 5.1. Modelo de navegação em duas camadas

**Camada 1 — Sidebar global colapsável.** Persistente em todos os módulos, permite trocar de módulo sem voltar ao portal. Colapsa para faixa de ícones. É onde vivem as bolinhas de atividade não vista.

**Camada 2 — Header contextual.** Dentro de um módulo, exibe breadcrumb, título da entidade e as **abas da etapa atual** (o padrão de pills do `SuppliesHeader`, generalizado).

O Portal permanece como tela de entrada obrigatória, redesenhado.

### 5.2. Componentes a criar

| Componente | Papel |
|---|---|
| `AppSidebar` | Navegação global colapsável, com badges por módulo |
| `ModuleHeader` | Breadcrumb + título + slot de abas, compartilhado por todos os módulos |
| `StepTabs` | Abas de etapa genéricas (generalização de `SuppliesHeader`) |
| `ActivityDot` | Bolinha de atividade não vista, alimentada por contagem |
| `AppLayout` | Composição sidebar + header, aplicada via `layout.tsx` |

### 5.3. Design system

Tokens de marca passam a ser **fonte única**: `@theme` do Tailwind v4 alimentado por `branding.ts`, com classes utilitárias nomeadas. Hex inline é erradicado por módulo, conforme cada um é migrado — não em varredura global.

### 5.4. Escopo de aplicação

Base criada agora e aplicada em Portal, Configurações e OrçaRede. Suprimentos, Andamento de Obra e Precificação migram gradualmente nas fases finais, sem reescrita funcional.

---

## 6. Configurações Gerais do Sistema

### 6.1. Rotas

```
/configuracoes                              hub
/configuracoes/materiais
/configuracoes/subgrupos
/configuracoes/concessionarias
/configuracoes/grupos            /novo  /[id]
/configuracoes/tipos-postes
/configuracoes/padroes-poste     /novo  /[id]
/configuracoes/segmentos                    novo
/configuracoes/empresa                      novo
/configuracoes/responsaveis                 novo
/configuracoes/templates-proposta           novo
/configuracoes/midia                        novo
/configuracoes/usuarios                     novo
/configuracoes/perfil                       novo
```

### 6.2. Ordem de extração

A cadeia de dependências é materiais → grupos → padrões. Extrair na ordem inversa da dependência:

1. Concessionárias (isolada)
2. Subgrupos
3. Materiais
4. Tipos de poste
5. Grupos + editor
6. Padrões de poste + editor

### 6.3. Trabalho real da extração

A UI é reaproveitada quase integralmente. O esforço está em três pontos:

**Estado de editor na URL.** Hoje `currentGroup` e `currentPoleStandard` vivem em memória no `AppContext`. Passam a vir de `[id]` na rota, com carregamento próprio.

**Invalidação cruzada de cache.** `materiais` e `postTypes` têm cache compartilhado com a Área de Trabalho. Editar em Configurações precisa invalidar o consumo no orçamento, e as actions precisam revalidar mais que `/`.

**Escritas fora do padrão.** `deleteAllMaterials` e `importMaterialsFromCSV` chamam RPC direto do client. Passam a ser server actions.

**Atenção:** editar grupo de item ou padrão de poste dispara cascata em `post_item_groups`, `post_item_group_materials`, `budget_posts` e `post_materials` de orçamentos existentes. É o ponto de regressão mais sensível da fase.

### 6.4. Telas novas

| Tela | Conteúdo |
|---|---|
| Empresa | Razão social, CNPJ, endereço, telefones, email, site, Instagram, **número de WhatsApp**, logo |
| Responsáveis técnicos | Vários cadastros com nome, CREA e imagem de assinatura; escolhidos por proposta |
| Segmentos de obra | Catálogo configurável (Rede Energia, Iluminação, Ramais, Primária, Secundária, Telecom…) |
| Templates de proposta | Texto institucional, estrutura de seções padrão, matriz de responsabilidade padrão |
| Biblioteca de mídia | Fotos com tags, reutilizáveis em qualquer proposta; importação da galeria de obras executadas |
| Usuários e permissões | Camada de permissão por módulo, sem alterar `profiles.role` |
| Perfil | Dados do usuário logado |

---

## 7. Esteira do Orçamento

### 7.1. Rotas

```
/orcamentos                                 lista (ex-Dashboard)
/orcamentos/[budgetId]                      redirect → /projeto
/orcamentos/[budgetId]/projeto              etapa 1
/orcamentos/[budgetId]/materiais            etapa 2
/orcamentos/[budgetId]/precificacao         etapa 3
/orcamentos/[budgetId]/proposta             etapa 4
```

### 7.2. Comportamento das etapas

Navegação **livre** entre abas. Etapa sem dado não bloqueia acesso — mostra estado vazio explicando o que falta e oferecendo o atalho para resolver. O único gate rígido é **publicar a proposta**, que exige precificação selecionada.

| Etapa | Conteúdo | Fonte |
|---|---|---|
| Projeto | Canvas + lista de postes + grupos de item + materiais avulsos + **marcação de segmento** | `budget_posts`, `post_item_groups`, `post_materials` |
| Materiais | Consolidado por material e por subgrupo, export Excel/CSV | agregação de postes |
| Precificação | Cenários de precificação (VS, custos, lucro) | `saved_pricing_budgets` |
| Proposta | Editor de seções + IA + publicação | `proposals` e filhas |

### 7.3. Segmentos de obra

Segmento é marcado **no orçamento**, não na proposta. Resolução em cascata:

```
grupo de item (override)  →  poste  →  "não segmentado"
```

Isso alimenta a tabela de valores globais por segmento da proposta e fica disponível para o Andamento de Obra no futuro.

### 7.4. Precificação com cenários

O `UNIQUE (user_id, budget_id)` é removido. Um orçamento passa a ter N precificações nomeadas, com uma marcada como principal.

O `PrecificacaoCalculator` é adaptado para modo embutido: recebe `budgetId` por prop, esconde o select de importação, e troca o redirect pós-save por callback. O fluxo standalone continua funcionando.

O campo **imposto** existe no motor de cálculo (`calculateServicePricing`) mas nunca foi exposto na UI — hoje passa sempre `0`. Decidir na Fase 4 se entra na tela.

`/tools/precificacao` permanece como **dashboard consolidado de consulta** entre orçamentos, com KPIs. A criação passa a acontecer só dentro da esteira.

---

## 8. Etapa de Proposta Comercial

### 8.1. Análise das propostas atuais

Base: `287.1_ANDORA_CONSTRUÇÕES_LTDA_Osório.RS.pdf` (14 páginas) e `163.4_MAXIF4_INCORPORACOES_LTDA_PASSO_FUNDO.pdf` (13 páginas).

**Elementos fortes a preservar:**

- Curva ABC dos materiais com valor e percentual por grupo
- Valor de investimento por lote/unidade
- Matriz de responsabilidade item a item (contratada × contratante)
- Separação entre faturamento direto do fornecedor e faturamento ON de serviços
- Escopo negativo explícito e detalhado
- Citação de norma específica por concessionária
- Descrição de atividades com quantitativo embutido
- Página de diferencial tecnológico vendendo o próprio OrçaRede
- Versionamento explícito da proposta
- Termo de aceite com CREA do responsável

**Problemas que a automação elimina:**

| Problema | Ocorrência |
|---|---|
| Placeholder de template não substituído | `"TEXTO DO SEU PARÁGRAFO"` na Maxif4, pág. 9 |
| Número divergente da palavra | `"05 (seis) transformadores"` na Andora |
| Valor inconsistente com o próprio percentual | Curva C na Maxif4 repete o valor da Curva B |
| Erros de digitação | `"MAPA ARQUITETÔONICO"`, `"cinqüenta e três"` |
| Frase quebrada | `"destinada necessários para a eletrificação"` |
| Estrutura divergente entre propostas | Maxif4 tem "Quem Somos", Andora não |
| Numeração de tabela incoerente | Tabela 01/02 significam coisas diferentes em cada uma |
| Contato inconsistente | `contato@` × `projetos.on.engenharia@gmail.com` |

**Regra de ouro derivada disso: número vem do banco, prosa vem da IA.** A IA nunca gera quantitativo — ela recebe os quantitativos já calculados e escreve o texto técnico em volta.

### 8.2. Regra do parcelamento

Nas duas propostas o parcelamento em 10x incide **apenas sobre o valor de serviço**, nunca sobre materiais — que são faturados direto do fornecedor. Isso mapeia exatamente no modelo da precificação, onde materiais passam por fora e o VS é a verba da ON.

### 8.3. Seções padrão

Todas ligáveis/desligáveis e reordenáveis por proposta.

| # | Seção | Origem do conteúdo |
|---|---|---|
| 1 | Capa | Orçamento + empresa + nº e versão da proposta |
| 2 | Quem Somos / Identidade / Compromisso | Template (texto institucional) |
| 3 | Seu Projeto | Upload manual de imagens |
| 4 | Localização da Obra | Upload manual |
| 5 | Fotos Executivas / Elétricas / Civil | Biblioteca de mídia + legendas |
| 6 | Descrição das Atividades | **Quantitativos do orçamento + prosa da IA** |
| 7 | Escopo dos Materiais Subdivididos | Consolidado por subgrupo |
| 8 | Curva de Preços (ABC) | **Automática, corte editável** |
| 9 | Condições de Faturamento de Materiais | Template |
| 10 | Valores Globais por Segmento | Segmentos + precificação |
| 11 | Valores Globais | Precificação |
| 12 | Investimento por Unidade | Precificação ÷ campo de unidades |
| 13 | Condições de Pagamento | **Gerador de parcelamento sobre o VS** |
| 14 | Cronograma Executivo | Manual |
| 15 | Matriz de Responsabilidade | Template, editável por proposta |
| 16 | Considerações Finais | Template + IA |
| 17 | Diferencial Tecnológico OrçaRede | Template (boilerplate) |
| 18 | Termo de Aceite | Responsável técnico + validade |
| 19 | Contato | Empresa |

### 8.4. Curva ABC

Gerada automaticamente por Pareto de valor sobre os subgrupos de material do consolidado. O corte A/B/C é editável, e as linhas podem ser renomeadas e agrupadas — porque o rótulo comercial não é sempre o nome técnico do subgrupo.

Validação obrigatória: a soma das curvas tem de fechar com o total, e o percentual tem de ser coerente com o valor. Foi exatamente essa checagem que faltou na proposta da Maxif4.

### 8.5. Gerador de parcelamento

Entrada: número de parcelas, existência de entrada, intervalo em dias. Saída: tabela de parcelas sobre o VS, com percentual, valor e vencimento. Resultado editável linha a linha depois de gerado.

### 8.6. Cenários na proposta

A proposta pode apresentar **mais de uma opção de preço** ao cliente, cada uma apontando para uma precificação salva, com rótulo e marcação de recomendada.

---

## 9. Proposta Pública e Analytics

### 9.1. Acesso

Rota `/proposta/[token]`, sem login.

- Token opaco e aleatório (não sequencial, não derivado de timestamp)
- RLS que **compara o token**, nunca `IS NOT NULL` — o precedente de `/obra/[...slug]` libera leitura anônima para qualquer registro com `public_id` preenchido, e esse padrão não deve ser repetido numa página que expõe preço
- Validade é **informativa** na peça; o link permanece ativo até revogação manual
- Revogação disponível no painel

### 9.2. Ações do cliente

Somente leitura, com dois botões: **baixar PDF** e **falar no WhatsApp** (número da empresa, vindo das Configurações). Não há aceite digital — o termo de aceite continua sendo página do PDF para assinatura manual.

### 9.3. Analytics

| Métrica | Captura |
|---|---|
| Primeira e última visita | timestamp por sessão anônima |
| Número de acessos | contagem de sessões |
| Tempo na página | heartbeat |
| Profundidade de rolagem | percentual máximo |
| Seções visualizadas | observer por seção |
| Download de PDF | evento |
| Clique no WhatsApp | evento |
| Dispositivo, SO, navegador | user agent |
| Localização aproximada | IP (armazenado com hash, não em claro) |

Notificação **em tempo real no painel e na central de notificações** do sistema quando o cliente abre a proposta pela primeira vez.

---

## 10. Notificações e Atividade Não Vista

### 10.1. Dois conceitos separados

Hoje existem três semânticas de "não visto" convivendo: `notifications.is_read` (Andamento de Obra), colunas `read_by_engineer_at` / `read_by_manager_at` (chat) e status de cotação disparando toast sem persistir nada (Suprimentos). Nenhuma chega ao Portal, e a bolinha que já aparece lá é decorativa.

A separação correta:

**Notificação** — evento discreto, com destinatário, histórico e "marcar como lida". A tabela `notifications` já resolve isso; precisa deixar de ser exclusiva de obras.

**Atividade não vista** — a bolinha por módulo. Resolvida por cursor de visita (`user_module_seen`) somado a uma query de contagem por módulo, reaproveitando as consultas que já existem em cada área. Assim não é necessário gerar notificação para tudo só para acender uma bolinha.

### 10.2. Query de badge por módulo

| Módulo | Sinal de novidade |
|---|---|
| Orçamentos | `budgets.updated_at` posterior à última visita |
| Precificação | `saved_pricing_budgets.updated_at` posterior à última visita |
| Suprimentos | cotações em `pendente_conciliacao`, `aguardando_revisao`, `erro_extracao` |
| Andamento de Obra | `notifications` não lidas + pendências de aprovação + chat não lido |
| Portal do Engenheiro | `work_trackings.updated_at` posterior à última visita |
| Propostas | primeira abertura pelo cliente, download de PDF, clique no WhatsApp |

### 10.3. Correções de brinde

- Adicionar `notifications` à publication do Realtime (uma linha de SQL; hoje o sino depende de polling)
- Conectar os badges de alertas e checklists que **já estão implementados** em `WorkCard` e `WorkTabsNav`, com os serviços de contagem já existentes, mas cujos valores ninguém passa
- Substituir a bolinha decorativa do Portal por contagem real

---

## 11. Modelo de Dados

Todas as mudanças são aditivas. Nomes sujeitos a ajuste na implementação.

### 11.1. Alterações em tabelas existentes

```
saved_pricing_budgets
  - DROP UNIQUE (user_id, budget_id)
  + scenario_name        TEXT NOT NULL DEFAULT 'Principal'
  + is_primary           BOOLEAN NOT NULL DEFAULT false
  + UNIQUE (user_id, budget_id, scenario_name)
  + UNIQUE parcial (user_id, budget_id) WHERE is_primary
  ⚠ o upsert com onConflict 'user_id,budget_id' precisa ser reescrito

budget_posts
  + segment_id           UUID NULL → work_segments(id)

post_item_groups
  + segment_id           UUID NULL → work_segments(id)   (override)

notifications
  + module_key           TEXT NULL
  + entity_type          TEXT NULL
  + entity_id            UUID NULL
  backfill: module_key = 'andamento-obra' onde work_id IS NOT NULL
  ALTER PUBLICATION supabase_realtime ADD TABLE notifications
```

### 11.2. Tabelas novas — configuração

```
company_settings              dados da empresa, logo, WhatsApp
technical_responsibles        nome, CREA, imagem de assinatura, ativo
work_segments                 catálogo de segmentos de obra
media_library                 fotos com tags, origem (upload | galeria de obra)
user_module_seen              cursor de visita por usuário/módulo/escopo
module_permissions            permissão por módulo, camada nova
proposal_templates            texto institucional + estrutura de seções padrão
proposal_template_resp_items  matriz de responsabilidade padrão do template
```

### 11.3. Tabelas novas — proposta

```
proposals                     nº, versão, status, template, responsável técnico,
                              unidades + rótulo, validade, share_token,
                              published_at, revoked_at
proposal_sections             seção, ordem, ativa, conteúdo JSONB
proposal_pricing_options      N precificações apresentadas, rótulo, recomendada
proposal_abc_rows             curva ABC materializada e editável
proposal_segment_totals       material + mão de obra por segmento
proposal_payment_terms        parcelas geradas, editáveis
proposal_responsibility_items matriz da proposta
proposal_media                mídias por seção, com legenda e ordem
proposal_views                sessão anônima, device, geo, tempo, scroll
proposal_view_events          eventos granulares (seção, PDF, WhatsApp)
```

---

## 12. Assistência de IA

### 12.1. Infra existente reaproveitável

SDK `@google/generative-ai`, chave em `GEMINI_API_KEY`, JSON mode com `responseSchema` já usado em três lugares, padrão de retry em lote em `runSemanticMatchLevel2`. Os prompts hoje são inline e duplicados entre a versão Next e a versão Edge — a etapa de proposta é a oportunidade de criar organização de prompts de verdade.

### 12.2. Modo de trabalho

**Rascunho estruturado na criação.** A IA recebe os dados reais — tipo de obra, cidade, concessionária, quantitativos de poste e metragem, materiais por subgrupo, valores da precificação, dados da empresa, texto institucional do template — e devolve um rascunho com cada seção separada em JSON estruturado. Nunca um textão único.

**Refinamento por bloco.** Cada seção tem ações próprias: reescrever mais formal, encurtar, expandir, ajustar tom. Tudo editável à mão a qualquer momento.

**Guardrails.** A IA não emite quantitativo, valor nem prazo. Esses campos são injetados pelo sistema. O prompt recebe os números como dados imutáveis e é instruído a citá-los sem recalcular.

**Sugestão de mídia por tag**, não por visão computacional — a IA sugere quais tags combinam com cada seção, e o sistema filtra a biblioteca.

### 12.3. Onde executa

Geração de texto cabe nos 60s do Hobby, em API route do Next. Se o rascunho completo estourar o tempo, quebrar por seção seguindo o padrão de lotes encadeados já usado no pipeline de suprimentos.

---

## 13. Geração de PDF

### 13.1. Stack

`@react-pdf/renderer` — layout declarativo em JSX com flexbox, fontes customizadas da marca e imagens reais, renderizado no Node **sem navegador**. Compatível com o plano Hobby.

Consequência aceita: a página web e o PDF são dois layouts irmãos, compartilhando dados e tokens de design, não o mesmo código. Espelho pixel-perfect exigiria Puppeteer com Vercel Pro ou serviço externo — descartado.

### 13.2. Convivência com o gerador atual

`pdf-lib` continua servindo o gerador de pedido a fornecedor e o export de cenário ideal. As duas stacks coexistem, com propósitos distintos.

### 13.3. Pontos de saída

- Painel interno: ao concluir a proposta, download imediato
- Página pública: botão de download para o cliente

### 13.4. Correção pendente

`/api/generate-pdf` não tem autenticação hoje. Corrigir na Fase 0, antes de qualquer rota nova de PDF.

---

## 14. Fases de Execução

Ordem incremental, sistema funcionando ao fim de cada fase.

### Fase 0 — Preparação

- Branch nova para o refactor
- Backup de produção e banco dev novo
- Resolver DEBT-014 (backfill de plantas para o Storage do dev)
- Autenticar `/api/generate-pdf`

### Fase 1 — Base de navegação e notificações

- Tokens de marca como fonte única
- `AppSidebar`, `ModuleHeader`, `StepTabs`, `AppLayout`
- Portal redesenhado
- `user_module_seen` + extensão de `notifications` + publication do Realtime
- Conectar os badges já implementados no Andamento de Obra
- Módulo piloto migrado ao novo chrome

### Fase 2 — Configurações Gerais

- Nove telas extraídas para `/configuracoes/*`, na ordem de dependência
- Editores com estado na URL
- Invalidação cruzada de cache com a Área de Trabalho
- `deleteAllMaterials` e `importMaterialsFromCSV` viram server actions
- Telas novas: empresa, responsáveis técnicos, segmentos, mídia, usuários, perfil
- Regressão obrigatória na cascata de grupo e padrão de poste

### Fase 3 — OrçaRede em rotas reais (etapas 1 e 2)

- `/orcamentos` e `/orcamentos/[budgetId]/projeto` e `/materiais`
- Canvas migrado sem tocar geometria
- Marcação de segmento
- Legado convive até validação

### Fase 4 — Precificação na esteira (etapa 3)

- Migration de cenários
- `PrecificacaoCalculator` em modo embutido
- `/tools/precificacao` vira dashboard consolidado
- Decidir exposição do campo de imposto

### Fase 5 — Proposta Comercial (etapa 4)

- Modelo de dados da proposta
- Templates e texto institucional
- Editor de seções com liga/desliga e reordenação
- Curva ABC automática com validação de fechamento
- Gerador de parcelamento
- IA: rascunho estruturado + ações por bloco
- PDF com `@react-pdf/renderer`

### Fase 6 — Proposta pública e analytics

- `/proposta/[token]` com RLS estreita
- Tracking de visualização e eventos
- Botões de PDF e WhatsApp
- Notificação de primeira abertura

### Fase 7 — Desligamento do legado

- Remover `AppShell`, `Layout` e `Sidebar` antigos e as views do `AppContext`
- Migrar Suprimentos, Andamento de Obra e Precificação ao chrome unificado
- Erradicar hex inline remanescente

---

## 15. Critérios de Aceite

### 15.1. Por fase

| Fase | Aceite |
|---|---|
| 1 | Trocar de módulo pela sidebar sem passar pelo portal; bolinha acende com atividade real e apaga ao visitar; sino do Andamento funciona em tempo real |
| 2 | As nove telas funcionam em rota própria com deep link; editar material em Configurações reflete no orçamento aberto; cascata de padrão de poste não regride |
| 3 | Orçamento abre por URL; canvas se comporta idêntico ao legado nos 4 modos (sem planta, PDF V1, PDF V2, raster); segmento marcável e persistido |
| 4 | Dois cenários de precificação coexistem no mesmo orçamento sem sobrescrever; precificar não exige sair da esteira |
| 5 | Proposta gerada sem placeholder vazado; curva ABC fecha com o total; quantitativos do texto batem com o orçamento; PDF sai com fotos e fonte da marca |
| 6 | Link público abre sem login; token de outra proposta não vaza dados; analytics registra abertura, tempo, scroll, PDF e WhatsApp |
| 7 | Nenhuma rota depende de `currentView`; visual consistente em todos os módulos |

### 15.2. Regressão permanente

A cada fase, validar os cinco consumidores de coordenada: orçamento, Portal do Engenheiro, import do Andamento de Obra, viewers públicos e contratos do APK.

---

## 16. Execução em Paralelo

### 16.1. Premissa

Agentes trabalhando em chats simultâneos **compartilham o mesmo filesystem**. Paralelizar só é seguro com propriedade exclusiva de arquivos: dois agentes editando o mesmo arquivo perdem trabalho silenciosamente.

O contrato de dados da proposta está fixado em `src/types/proposal.ts` **antes** da paralelização. Ele é a fonte única que impede o motor de PDF, a camada de IA e as migrations de divergirem. É consumido como leitura pelas três frentes e alterado por ninguém sem aviso.

### 16.2. Onda 1 — cinco frentes simultâneas

| Frente | Escopo | Propriedade exclusiva de arquivos |
|---|---|---|
| **A. Fundação visual** | Tokens de marca, sidebar global, header contextual, abas de etapa, bolinha de atividade; aplicado ao Portal | `src/components/layout/**` (novo), `src/app/layout.tsx`, `src/app/globals.css`, `src/lib/branding.ts`, `src/components/AdminPortal.tsx` |
| **B. Modelo de dados** | Todas as migrations do escopo, entregues como arquivo | `supabase/migrations/**` (só arquivos novos) |
| **C. Motor de PDF** | Renderizador das 19 seções com `@react-pdf/renderer`, dirigido por `ProposalData` | `src/services/pdf/proposal/**` (novo), `package.json` |
| **D. Camada de IA** | Rascunho estruturado + ações por bloco, com guardrails de quantitativo | `src/services/ai/proposal/**` (novo), `src/services/ai/prompts/**` (novo) |
| **E. Correções da Fase 0** | Auth no gerador de PDF, backfill de plantas, wiring de badges já existentes | `src/app/api/generate-pdf/route.ts`, `scripts/**`, componentes de Andamento de Obra listados na frente |

Sem interseção de arquivos entre as cinco frentes. Apenas a frente C instala dependência — nenhuma outra roda gerenciador de pacotes.

### 16.3. Onda 2 — depende de A e B

Só começa quando a fundação visual e as migrations estiverem aplicadas em dev.

| Frente | Depende de |
|---|---|
| Configurações Gerais em rotas próprias | A (chrome), B (tabelas de config) |
| OrçaRede em rotas reais, etapas 1 e 2 | A, B (segmentos) |
| Precificação embutida na esteira | B (cenários) |
| Editor de proposta | B, C, D |
| Proposta pública e analytics | B, C |

### 16.4. Regras para todas as frentes

1. Editar **apenas** os arquivos da própria propriedade. Precisando de outro, registrar o pedido em vez de editar.
2. Migrations nunca são aplicadas pelo agente — apenas escritas.
3. `src/types/proposal.ts` é leitura. Divergência necessária vira pedido registrado.
4. Nada de tocar no canvas conforme a seção 3.1.
5. Cada frente termina com o projeto compilando.
