Esse é o Guia para como deve ser o Modulo de Fornecedores/Supimentos:


1. Descrição do Negócio (Escopo)
O módulo atua como um sistema de inteligência de compras e conciliação de materiais. Ele automatiza a ingestão de múltiplas cotações em PDF de diferentes fornecedores, estrutura esses dados não formatados utilizando IA (LLM), e cruza os itens cotados com uma fonte da verdade (que pode ser a lista de materiais de um orçamento específico ou o catálogo global do sistema). O sistema fornece ferramentas analíticas para o usuário decidir a estratégia de compra com o maior custo-benefício e rastrear o histórico de preços do mercado.

2. Objetivos do Sistema
Otimizar o tempo gasto no data entry manual, permitindo a ingestão simultânea de dezenas de propostas comerciais sem bloquear a navegação do usuário.

Agilizar a padronização de nomenclatura de materiais de mercado para a nomenclatura técnica do sistema através de uma memória "De/Para".

Comparar matematicamente cenários de compra: fechar um pacote único com um fornecedor vs. pulverizar a compra selecionando o menor preço item a item.

Rastrear a evolução de preços dos materiais ao longo do tempo e por fornecedor.

3. Atores do Sistema
Comprador / Analista de Suprimentos: Opera a esteira de cotação (cria sessões, faz upload dos PDFs em lote, resolve pendências de conciliação e toma a decisão de compra).

Orçamentista / Engenheiro: Define o escopo técnico no canvas e gera o orçamento base (que pode servir de "Fonte da Verdade" para uma sessão de cotação específica).

4. Requisitos Funcionais (RF)
RF01 (Gestão de Sessões): O sistema deve permitir a criação de "Sessões de Cotação", que agrupam múltiplas cotações de fornecedores.

RF02 (Upload em Lote): O sistema deve permitir o upload simultâneo de múltiplos arquivos PDF de fornecedores para uma sessão.

RF03 (Extração Assistida): O sistema deve extrair de forma estruturada (JSON) os itens e observações de cada PDF utilizando IA.

RF04 (Conciliação Automática e Manual): O sistema deve vincular automaticamente itens do fornecedor aos itens do sistema usando o histórico de mapeamento. Itens sem correspondência devem permitir vínculo manual com definição de fator de conversão.

RF05 (Cenários de Compra): O sistema deve calcular e exibir dois cenários: "A" (ranking do menor preço por pacote fechado) e "B" (composição do menor preço cruzando todos os fornecedores).

RF06 (Histórico de Preços): O sistema deve exibir o histórico de preços de um material específico, filtrando cotações passadas.

5. Requisitos Não-Funcionais (RNF)
RNF01 (Processamento Assíncrono): A extração do PDF e a chamada à IA devem ocorrer em background. O usuário não deve ter a tela bloqueada durante o processamento do lote.

RNF02 (Notificação em Tempo Real): O sistema deve utilizar Supabase Realtime para notificar o usuário (na interface da sessão ou via Toasts globais) sobre o progresso e a conclusão da extração de cada arquivo.

RNF03 (Resiliência de Lote): Falhas na extração de um PDF específico (ex: arquivo corrompido, timeout) não devem interromper ou invalidar o processamento dos demais PDFs na fila da mesma sessão.

RNF04 (Estabilidade de Payload): A transferência de arquivos para processamento no servidor deve ocorrer via referência (caminho no Storage), evitando tráfego de buffers pesados nas requisições HTTP do Next.js.

RNF05 (Estimativa de Tempo): O sistema deve fornecer uma estimativa de tempo (ETA) para a conclusão da fila de extração.

6. Requisitos de Domínio do Negócio (RDN)
RDN01 (Fonte da Verdade Dinâmica): O vínculo de materiais na conciliação depende do escopo da Sessão de Cotação:

Sessão Vinculada: Se atrelada a um budget_id, os itens da cotação só podem ser vinculados à lista de materiais exigida por aquele orçamento.

Sessão Global: Se não houver budget_id, os itens podem ser vinculados a qualquer material do catálogo global do sistema.

RDN02 (Preço Normalizado): A unidade de medida do fornecedor frequentemente difere do projeto (ex: sistema pede "Metro", fornecedor vende "Rolo 100m"). O preço válido para comparação em todos os cenários é sempre o Preço Normalizado (preco_unit / conversion_factor).

RDN03 (Tolerância Matemática): Discrepâncias identificadas pela IA entre o cálculo de (preco_unit * quantidade) e o total_item da nota devem acionar um alerta visual de inconsistência na proposta do fornecedor.

7. Jornada do Usuário (Foco em Alta Produtividade)
Início e Setup: O usuário entra na rota /fornecedores, visualiza o painel de métricas gerais e clica em "Nova Sessão de Cotação". Ele decide se a compra será para a "Obra X" (vinculada) ou repoisão de estoque geral (global).

Ingestão em Lote: Na aba de Importação da sessão, ele arrasta 8 PDFs para a dropzone. O sistema faz o upload e devolve o controle da tela instantaneamente, exibindo os cards com o status "Na fila / Processando".

Multitarefa (Opcional): O usuário pode ir para outra tela do sistema montar um orçamento. Ao terminar o processamento em background, um Toast avisa que a sessão "Cotação Cabos Obra X" está pronta.

Conciliação Focada: Ele volta para a sessão, aba Conciliação. O sistema processou os 8 PDFs e realizou auto-match em 85% dos itens. Ele mapeia os 15% restantes manualmente, definindo os fatores de conversão (salvos para uso futuro).

Decisão Baseada em Dados: Na aba de Cenários, ele compara as tabelas. O Cenário A indica o Fornecedor Y como o mais barato no pacote, mas o Cenário B mostra uma economia de R$ 3.000 se ele comprar as ferragens do Fornecedor Z.

Auditoria: Achando o preço do "Cabo 16mm" alto, ele clica no item e vê o gráfico de Histórico de Preços, confirmando que pagou 10% a menos no mês passado com outro fornecedor.

8. Telas, Abas e Componentes
Dashboard Principal (/fornecedores)

QuotationSessionsHub: Lista de cards com sessões ativas e concluídas.

NewSessionModal: Modal para criar a sessão, escolhendo nome e opcionalmente atrelando a um budget_id.

GlobalMetricsPanel: KPIs rápidos (total cotado no mês, economias geradas).

Sessão de Cotação (/fornecedores/[sessionId])

Aba: Importar (&tab=importar)

BatchDropzoneManager: Área de upload em lote que insere os jobs no banco.

ExtractionJobBoard: Painel atualizado via Realtime exibindo a fila de PDFs, status (spinner, erro, sucesso) e ETA.

Aba: Conciliar (&tab=conciliar)

BatchConciliationTable: Tabela consolidando todos os itens extraídos daquela sessão vs. Fonte da Verdade.

MatchFilters: Filtros rápidos (Pendentes, Resolvidos).

ManualMatchModal: Interface para buscar o material, inserir fator de conversão e salvar na memória De/Para.

Aba: Cenários (&tab=cenarios)

ScenarioARanking: Tabela agregada listando o custo total por fornecedor (pacote fechado).

ScenarioBBreakdown: Tabela detalhada mostrando a melhor oferta disponível item a item.

PriceHistoryChartModal (Novo): Gráfico acionado por clique em um material, buscando o histórico de supplier_quotes antigas.