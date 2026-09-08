-- =============================================================================
-- PERFORMANCE: a conferência semanal.
--
-- Fase 5 do docs/perf-plano-sistema-rapido.md, item "um olho no painel". São
-- cinco minutos por semana para não deixar o sistema escorregar de volta.
--
-- ONDE RODAR
--   NÃO é o SQL Editor. É o Logs Explorer do dashboard do Supabase de produção
--   (Logs > Explorer), que consulta os logs, não o banco. A linguagem parece
--   SQL mas é a do backend de logs, por isso as funções esquisitas tipo
--   toFloat64OrNull.
--
--   Escolha a janela de tempo no seletor do próprio Explorer. O ideal é uma
--   hora de uso de verdade, não o sistema parado, senão tudo parece rápido.
--
-- O QUE PROCURAR
--   O sinal de alarme é `budget_posts` aparecer com centenas de chamadas.
--   Quer dizer que alguma tela voltou a carregar orçamento inteiro sem
--   precisar, que foi exatamente o que derrubou a produção em 08/09/2026
--   (docs/perf-diagnostico-producao.md).
--
-- METAS
--   budget_posts        abaixo de 50 chamadas na janela
--   média geral         abaixo de 500 ms
--   statement timeout   zero
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. O panorama: quem mais fala com o banco, e quanto demora.
--
-- Esta é a consulta do diagnóstico, a mesma que produziu os números de
-- referência. Rode primeiro e olhe as duas coisas: se alguma rota tem contagem
-- desproporcional, e se a média saiu da casa das dezenas de milissegundos.
-- -----------------------------------------------------------------------------
select log_attributes['request.path'] as caminho,
       count(*) as chamadas,
       round(avg(toFloat64OrNull(log_attributes['response.origin_time']))) as media_ms
from logs where source = 'edge_logs'
group by caminho order by chamadas desc limit 15;


-- -----------------------------------------------------------------------------
-- 2. O termômetro: só budget_posts.
--
-- Variante da consulta 1, filtrando a leitura cara. Na janela do diagnóstico
-- foram 1.466 chamadas com média de 16,4 s. A meta é abaixo de 50, com média
-- na casa das centenas de milissegundos.
-- -----------------------------------------------------------------------------
select count(*) as chamadas,
       round(avg(toFloat64OrNull(log_attributes['response.origin_time']))) as media_ms
from logs
where source = 'edge_logs'
  and log_attributes['request.path'] like '%budget_posts%';


-- -----------------------------------------------------------------------------
-- 3. O banco cancelando trabalho.
--
-- Qualquer resultado diferente de zero aqui quer dizer que o Postgres está
-- desistindo de queries por tempo. Na janela do diagnóstico foram 239 em uma
-- hora. Se aparecer, volte para a consulta 1: alguma coisa está inundando o
-- banco e isto é a consequência, não a causa.
-- -----------------------------------------------------------------------------
select count(*) as cancelamentos
from logs
where source = 'postgres_logs'
  and event_message like '%canceling statement due to statement timeout%';


-- =============================================================================
-- E o teste que não precisa de ferramenta nenhuma
--
--   Abrir o Portal, ir até uma sessão de Suprimentos e voltar, com o sistema
--   em uso. Se cada passo responder abaixo de um segundo, está no lugar.
--
--   Se estiver lento e as três consultas acima estiverem limpas, o problema é
--   outro e vale medir de novo antes de mexer em qualquer coisa.
-- =============================================================================
