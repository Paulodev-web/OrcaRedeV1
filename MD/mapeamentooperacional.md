Mapeamento Operacional — ON Engenharia Elétrica
Descrição Completa do Estado Atual + Expansão Mapeada
1. Contexto da empresa

A ON Engenharia Elétrica é uma empresa de engenharia elétrica especializada em projetos de redes de distribuição elétrica. A operação hoje é dividida em quatro setores funcionais: Comercial, Engenharia, Compras e Execução. Cada setor tem responsabilidades distintas, mas o fluxo entre eles hoje acontece de forma fragmentada — via WhatsApp, Excel e sistemas desconectados — o que gera retrabalho, perda de contexto e dificuldade de rastreamento.

A empresa já usa o OrçaRede, sistema desenvolvido por Paulo, que cobre o ciclo técnico interno da Engenharia. O que falta é uma camada operacional que conecte os setores entre si e formalize o fluxo de trabalho de ponta a ponta — do contato comercial com o cliente até a execução em campo.

2. O sistema atual (OrçaRede) — o que já existe

O OrçaRede é uma plataforma web multi-módulo rodando em Next.js 16 + Supabase, com os seguintes módulos ativos:

OrçaRede (núcleo) — sistema de orçamentação técnica com canvas interativo sobre PDF de planta, posicionamento de postes, BOM consolidado por material, exportação Excel, catálogo de materiais, tipos de poste e grupos de itens.

Suprimentos e Cotações — cadastro de fornecedores, sessões de cotação, extração de PDF via IA (Gemini), conciliação de itens, cenários de compra A/B/Ideal, exportação Excel/PDF.

Andamento de Obra — módulo completo para acompanhamento de obras em campo: canvas de execução, chat engenheiro↔gerente, diário de obra, progresso com curva S, equipe, checklists, alertas, galeria de mídias.

Precificação — importa orçamento do OrçaRede, calcula valor de serviço, lucro, imposto e materiais faturados por fora. Exporta Excel.

Gerador PDF — ferramenta interna de geração de PDF a partir de template.

Portal do Engenheiro (legado) — acompanhamento simplificado de instalações, candidato a consolidação com o Andamento de Obra.

A integração entre módulos já existe parcialmente: OrçaRede → Precificação → Suprimentos → Andamento de Obra funcionam como uma esteira, com budget_id como fio condutor.

O que não existe ainda: controle de usuários por setor, fluxo de passagem de tarefas entre setores, exibição de proposta para cliente, e administração de papéis (RBAC).

3. O fluxo operacional real mapeado na visita

O ciclo completo de um projeto na ON Engenharia funciona assim:

Fase 1 — Originação comercial

O cliente entra em contato solicitando um orçamento. O setor Comercial é o ponto de entrada: coleta as informações do cliente, entende o escopo (tipo de rede, localização, concessionária, prazo), e precisa repassar essas informações formalizadas para a Engenharia. Hoje isso acontece via WhatsApp ou verbal, sem registro estruturado.

Fase 2 — Orçamentação técnica

A Engenharia recebe a demanda e abre um orçamento no OrçaRede. Usa o canvas para montar a rede na planta, define postes, grupos de materiais, BOM completo. Ao finalizar, tem o orçamento técnico com todos os materiais e quantitativos.

Fase 3 — Precificação e montagem da proposta

Com o orçamento técnico pronto, a Engenharia (ou o Comercial, dependendo do caso) entra no módulo de Precificação, importa o orçamento, aplica margem, impostos e custos de serviço. O resultado é uma proposta comercial. Hoje essa proposta é exportada em Excel ou PDF genérico — não existe um exibidor visual profissional para o cliente.

Fase 4 — Apresentação ao cliente

O Comercial recebe a proposta pronta e a envia ao cliente. Hoje isso é manual — PDF por e-mail ou WhatsApp. O cliente não tem nenhuma interface visual para consultar, comparar ou aceitar formalmente.

Fase 5 — Aceite e abertura do projeto

Cliente aceita. A Engenharia então elabora o projeto executivo e o orçamento de implementação (que é diferente do orçamento de venda — é o orçamento operacional da execução). Esse orçamento de implementação passa novamente pelo Comercial para validação/envio ou vai direto para Compras.

Fase 6 — Compras

O setor de Compras recebe a lista de materiais do orçamento de implementação e precisa gerar Ordens de Compra. Hoje o fluxo é: sai do OrçaRede, entra no GestãoClick (ERP externo), cria a OC manualmente, volta pro OrçaRede e digita o número da OC. Gargalo manual crítico já identificado.

Fase 7 — Execução em campo

Com materiais comprados e obra liberada, o setor de Execução recebe a obra. Hoje o Andamento de Obra já suporta esse ciclo: o engenheiro responsável acompanha via web, o gerente de obra via APK (ainda não implementado), a equipe de campo registra instalações de postes, fotos, checklists. Chat, diário, alertas e galeria já funcionam.

4. Os gargalos identificados

Entre Comercial e Engenharia: não existe handoff formalizado. A demanda do cliente chega sem estrutura, a Engenharia começa o orçamento sem briefing padronizado, e o status do orçamento não é visível para o Comercial em tempo real.

Entre Engenharia e Comercial (proposta): a proposta sai como arquivo estático. Não há um link público, não há aceite formal, não há histórico de versões de proposta.

Entre Engenharia e Compras: o orçamento de implementação não tem um caminho formal para virar lista de compras. O comprador precisa reinterpretar o BOM manualmente.

Entre Compras e GestãoClick: processo totalmente manual de ida e volta entre sistemas para geração de OC.

Entre Comercial/Engenharia e Execução: a abertura de obra no Andamento de Obra hoje é feita manualmente pelo engenheiro, sem ligação direta com o aceite do cliente ou aprovação comercial.

Administração de usuários: hoje o sistema tem um único nível de acesso. Não existe separação de papéis — qualquer usuário vê tudo e pode fazer tudo. Não há como dar acesso ao pessoal do Comercial sem expor módulos técnicos da Engenharia, ou dar acesso ao Compras sem expor precificação.

5. O que vai ser construído — expansão mapeada
5.1 — Sistema de Tasks com RBAC (o "Trello interno")

Um módulo de gestão de trabalho nativo dentro do OrçaRede, com:

Tasks vinculadas a projetos/orçamentos — cada task tem título, descrição, setor responsável, prazo, status e histórico.
Passagem de task entre setores — Comercial cria e passa para Engenharia, Engenharia entrega e passa de volta para Comercial ou para Compras, etc. Cada transição fica registrada.
Chat por task — conversa contextualizada dentro da task, sem precisar sair para WhatsApp.
RBAC (controle de acesso por papel) — cada usuário tem um papel: Comercial, Engenharia, Compras ou Execução. Cada papel vê e acessa apenas o que é relevante para ele.
Kanban/board por setor — visão do que está na fila, em andamento e concluído para cada setor.
Notificações — quando uma task chega no seu setor, você é notificado (já existe infraestrutura de notificações no Andamento de Obra, reutilizável).
5.2 — Exibidor de Proposta em LP

Uma landing page gerada automaticamente a partir do orçamento precificado, com:

URL única por proposta (pública ou com token de acesso).
Layout visual profissional com identidade da ON Engenharia.
Seções: resumo do projeto, escopo, materiais principais, valor, prazo, condições.
Botão de aceite formal — cliente clica, confirma, e isso dispara automaticamente a abertura da task na Engenharia para início do projeto executivo.
Histórico de versões de proposta (v1, v2 revisada, etc.).
Rastreamento de visualização (cliente abriu, quando, quantas vezes).
5.3 — Administração de Usuários

Painel administrativo para gestão de usuários do sistema:

Criação de contas por papel: Comercial, Engenharia, Compras, Execução.
Cada papel com permissões granulares — o Comercial não acessa canvas técnico, o Compras não acessa precificação, etc.
Aproveitamento do Supabase Auth + RLS já existente, adicionando os novos roles à tabela profiles.
Painel do administrador (provavelmente o próprio Luan ou responsável) para criar/desativar usuários, mudar papéis.
5.4 — Integração com GestãoClick

Integração via API para eliminar o gargalo de Compras:

A partir do orçamento de implementação aprovado no OrçaRede, gerar Ordem de Compra no GestãoClick diretamente.
Retornar o número da OC automaticamente para o OrçaRede.
Visão no módulo de Suprimentos: o que já tem OC gerada vs. o que está pendente.
6. Arquitetura geral da expansão

Tudo isso encima do OrçaRede existente — não é um sistema novo. É a mesma plataforma Next.js + Supabase ganhando:

Novos roles em profiles (comercial, compras, execução — além do engineer já existente).
Novo módulo /tasks ou /operacional — o hub de tasks com kanban e chat.
Nova rota pública /proposta/[token] — o exibidor de LP.
Novo módulo /admin/usuarios — gestão de usuários.
Nova integração /api/gestaoclick — ponte com o ERP.
Extensão do sistema de notificações já existente para cobrir eventos de task entre setores.

O fio condutor continua sendo o budget_id — cada projeto que nasce no OrçaRede gera um ciclo de tasks que percorre os setores até a execução em campo.