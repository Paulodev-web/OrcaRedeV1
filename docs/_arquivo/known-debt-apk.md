# Known debt — APK OrcaRede

> As dividas tecnicas do projeto **web** sao mantidas em `[repo-web]/docs/known-debt.md`. Este arquivo cobre apenas as dividas do APK e dividas herdadas relevantes para o APK. Nao e duplicacao — sao escopos diferentes.

Ultima atualizacao: 2026-05-12 (Bloco 7).

---

## Severidade

- **Alta** — bloqueia ou compromete funcionalidade critica; deve ser tratada antes do GA.
- **Media** — afeta DX, manutenibilidade ou tem risco moderado; tratar nos blocos de consolidacao.
- **Baixa** — cosmetico, otimizacao ou caso raro; tratar quando custo for baixo.

---

## Dividas herdadas do web (relevantes para o APK)

| ID       | Severidade | Resumo                                                    | Impacto APK                                                            |
| -------- | ---------- | --------------------------------------------------------- | ---------------------------------------------------------------------- |
| DEBT-005 | Baixa      | PDF signed URL sem fallback no web                        | APK trata falha com retry + empty state quando renderizar PDF (Bloco 3)|
| DEBT-006 | Media      | Cleanup de uploads orfaos manual no web                   | APK tambem gera orfaos quando crash entre upload e RPC (DEBT-006a)     |
| DEBT-008 | Alta       | Sem testes E2E/unitarios no web                           | APK nasce com Jest desde Bloco 1 e Detox a partir do Bloco 3           |
| DEBT-010 | Baixa      | i18n nao implementada (pt-BR hardcoded)                   | APK segue mesmo idioma; sem i18n na v1                                 |
| DEBT-011 | Media      | Sem metricas/analytics no web                             | APK tem Sentry desde v1                                                |
| DEBT-014 | Baixa      | Cross-project Storage (dev → prod)                        | Nao bloqueia APK                                                       |

---

## Dividas novas do APK

### DEBT-015 — Divergencia Server Action (web) vs RPC SQL (APK)

**Severidade:** Media.

**Descricao:** Mesma regra de negocio implementada duas vezes — em TypeScript no web (Server Actions) e em PL/pgSQL no APK (RPCs). Risco de divergencia de comportamento (ex.: validacao mais estrita em um lado, mensagem de erro diferente, edge case nao coberto).

**Mitigacao atual:** Testes de contrato a partir do Bloco 2 — para cada par (Server Action, RPC), suite de testes que envia o mesmo input nos dois e compara output (incluindo erros). Localizado em `__tests__/contracts/`.

**Resolucao planejada:** Pos-v1, refactor 3a — Server Actions do web viram thin wrappers das RPCs SQL (chamada via supabase service role). Fonte unica de verdade. Estimativa: 1-2 sprints apos GA.

---

### DEBT-016 — Token orfao em `device_tokens` (>30 dias sem `last_seen_at`)

**Severidade:** Baixa.

**Descricao:** Quando o manager troca de celular ou desinstala o app, o token continua em `device_tokens` ate ser usado em algum push (e o Expo retornar receipt invalido) ou ate cleanup manual. Nao quebra nada, mas polui a tabela e gera tentativas de push para tokens mortos.

**Mitigacao atual:** Nenhuma. Tokens orfaos ficam ate o cleanup ser implementado.

**Resolucao planejada:** Bloco 8b — quando implementarmos a Edge Function de push, processar receipts da Expo Push API. Token com erro permanente (`DeviceNotRegistered`, `InvalidCredentials`) e marcado para delecao. Adicionalmente, cron job semanal deletando tokens com `last_seen_at < now() - interval '30 days'`.

---

### DEBT-017 — Recompressao de video nao implementada

**Severidade:** Baixa.

**Descricao:** O scope (Secao 8.3) trava captura de video em 720p/30s sem recompressao no app. Funciona porque o `expo-camera` aceita esses parametros nativamente. Mas se o usuario importar video da galeria via `expo-image-picker` (futuro fluxo), o video pode passar de 720p ou ter codec incompativel.

**Mitigacao atual:** Bloquear import via galeria por enquanto. So permitir captura via camera no Bloco 2.

**Resolucao planejada:** Avaliar `react-native-compressor` ou `ffmpeg-kit` se a necessidade surgir. Recompressao de video em React Native e fragil — preferir solucao no servidor (transcode via Edge Function pos-upload) se o problema escalar.

---

### DEBT-018 — `user_metadata.must_change_password` nao setado pelo web

**Severidade:** Baixa.

**Descricao:** Quando o engineer cria um manager via `createUser` no web (Server Action), o `user_metadata.must_change_password` nao e setado como `true`. O APK trata ausencia desse campo como `false` (nao bloqueia), entao managers que nunca tiveram o flag setado nunca caem na tela de troca de senha. Risco: managers ficam com a senha temporaria fornecida pelo engineer indefinidamente.

**Mitigacao atual:** APK le o flag defensivamente. Tela de troca de senha (`app/(auth)/change-password.tsx`) existe e funciona — apenas nao e ativada automaticamente sem o flag.

**Resolucao planejada:** Quando o fluxo de criacao de manager for integrado (provavelmente Bloco 8 ou no momento da virada para producao), atualizar a Server Action `createUser` no web para setar `user_metadata.must_change_password = true` ao criar. Adicionalmente, considerar uma migration que set o flag para todos os managers existentes que ainda usam senha temporaria.

---

### DEBT-019 — Gravacao de audio nao implementada no chat

**Severidade:** Baixa.

**Descricao:** O chat do Bloco 2 suporta envio de texto, foto e video curto, mas nao suporta gravacao de audio pelo manager. Playback basico de audio recebido do engineer funciona via `expo-av`. Gravacao de audio via microfone requer UI de gravador (botao hold-to-record ou tap-to-record) e compressao para AAC/M4A mono 64kbps, o que adiciona complexidade significativa.

**Mitigacao atual:** Botao de audio nao aparece no composer. Se o engineer enviar audio, o APK exibe metadados (duracao) com placeholder. Playback minimo pode ser implementado se simples o suficiente.

**Resolucao planejada:** Bloco 9 (consolidacao offline-first) ou sprint dedicado pre-GA. Avaliar `expo-av` Recording API.

---

### DEBT-020 — Preview inline de video nao implementado no chat

**Severidade:** Baixa.

**Descricao:** Videos enviados/recebidos no chat sao exibidos como placeholder com metadados (tipo + duracao). Nao ha player inline na lista de mensagens. Playback full requer `expo-av` Video component com controles nativos, gerenciamento de lifecycle (pausar ao sair da tela), e performance em FlatList invertida com muitos itens.

**Mitigacao atual:** Video mostra icone + duracao. Tap nao abre player neste bloco.

**Resolucao planejada:** Bloco 9 ou sprint dedicado. Avaliar `expo-av` Video component com controls e poster image.

---

### DEBT-021 — Overlay de postes pode desfasar do PDF durante pan rapido

**Severidade:** Media.

**Descricao:** A camada de marcadores de postes (PoleOverlay) e renderizada como View absoluta sobre o componente `react-native-pdf`. A posicao dos marcadores e recalculada a partir de `onScaleChanged`, mas a lib nao expoe callback reativo para scroll/pan contínuo. Durante pan rapido, os marcadores podem apresentar lag visual (parecem "flutuar" antes de se reposicionar). Este e o tradeoff da Opcao B descrita no escopo do Bloco 3.

**Mitigacao atual:** Aceitavel na v1. Marcadores tem tamanho fixo e nao escalam com zoom, o que reduz o efeito visual do desalinhamento. Em zoom alto o usuario tipicamente faz pan lento (precisao), minimizando o problema.

**Resolucao planejada:** Bloco 9 (consolidacao) — avaliar migracao para Opcao C (rasterizar pagina 1 do PDF como imagem de alta resolucao e usar `react-native-image-zoom` com overlay sincronizado). Alternativa: investigar se versoes futuras do `react-native-pdf` expoem callback de scroll offset.

---

### DEBT-022 — Edicao de poste ja instalado nao implementada

**Severidade:** Baixa.

**Descricao:** Nao ha fluxo de edicao de um poste ja registrado (alterar numeracao, tipo, notas, coordenadas). O workaround documentado e remover o poste e reinstalar com os dados corretos.

**Mitigacao atual:** Remove + reinstala serve como workaround funcional.

**Resolucao planejada:** Avaliar necessidade real apos feedback de campo. Se necessario, criar RPC `rpc_update_pole_installation` no Bloco 9.

---

### DEBT-023 — Acumulado de metragem por obra nao implementado

**Severidade:** Media.

**Descricao:** O diario de obra (Bloco 4) exibe apenas a metragem planejada como referencia visual para o manager. O acumulado real (soma de metragens de todas as revisoes aprovadas anteriores) nao e calculado nem exibido. O manager precisa fazer a conta mentalmente ou verificar diarios anteriores.

**Mitigacao atual:** V1 mostra apenas `meters_planned` do `work_project_snapshot` como referencia. Sem acumulado.

**Resolucao planejada:** Bloco 9 (consolidacao) — criar view materializada ou query com SUM sobre `work_daily_log_revisions` aprovadas, agrupando por obra. Exibir como "Acumulado ate ontem: BT Xm / MT Ym / Rede Zm" na tela do form.

---

### DEBT-024 — Rascunho local do diario nao persistido

**Severidade:** Baixa.

**Descricao:** Se o manager preencher o formulario do diario parcialmente e sair da tela sem publicar, os dados sao perdidos. Nao ha persistencia em AsyncStorage do rascunho em andamento.

**Mitigacao atual:** Nenhuma. Manager precisa repreencher o formulario se sair sem publicar.

**Resolucao planejada:** Avaliar necessidade apos feedback de campo. Se necessario, salvar rascunho em AsyncStorage keyed por `${workId}:${logDate}` e limpar ao publicar com sucesso.

---

### DEBT-025 — Filtros de alertas nao implementados

**Severidade:** Baixa.

**Descricao:** A lista de alertas mostra todos os alertas da obra sem filtros por severidade, categoria ou status. Em obras com muitos alertas, a navegacao pode ficar dificil.

**Mitigacao atual:** Alertas sao ordenados por data (mais recentes primeiro). Severidade visual forte ajuda a identificar criticos rapidamente.

**Resolucao planejada:** Bloco 8+9+10 (consolidacao) — adicionar FlatList header com chips de filtro por status e severidade.

---

### DEBT-026 — Mapa inline com localizacao do alerta nao implementado

**Severidade:** Baixa.

**Descricao:** O detalhe do alerta exibe coordenadas GPS como texto com link para o Google Maps. Nao ha mapa inline (ex.: react-native-maps) mostrando a localizacao visualmente no proprio app.

**Mitigacao atual:** Link "Abrir no Maps" redireciona para o Google Maps externo. Funcional, mas requer sair do app.

**Resolucao planejada:** Avaliar necessidade apos feedback de campo. Se necessario, adicionar react-native-maps com marker no detalhe do alerta (requer novo Dev Client build).

---

### DEBT-027 — `fetchWorks` com embeds (milestones, contagens) e RLS

**Severidade:** Media (somente se ocorrer em producao).

**Descricao:** A lista de obras (`app/(main)/index.tsx`) usa um `select` PostgREST com relacionamentos/contagens (`work_milestones`, `work_project_posts`, `work_pole_installations`). Se as politicas RLS ou grants nao permitirem esses embeds para o papel `manager`, a query pode falhar ou retornar `null` nos relacionamentos.

**Mitigacao atual:** Tratar erro na UI (lista vazia / mensagem). Confirmar no Supabase que `select` aninhado esta permitido para as tabelas envolvidas.

**Resolucao planejada:** Se necessario, simplificar o `select` (sem embed) e buscar milestones/contagens em queries separadas ou via RPC agregadora.

---

## Como abrir uma nova divida

1. Adicionar entrada nesta lista com proximo ID disponivel (ex.: DEBT-028).
2. Preencher Severidade, Descricao, Mitigacao atual, Resolucao planejada.
3. Referenciar no PR/commit que introduziu a divida (ex.: "ver DEBT-021 em known-debt.md").
4. Se a severidade for Alta, criar issue no tracker e linkar aqui.
