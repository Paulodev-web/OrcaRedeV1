# Guia do módulo de Fornecedores / Suprimentos

Documento de produto e de implementação alinhado ao estado **atual** do repositório OrcaRede (Next.js App Router, Supabase, Gemini). Detalhes técnicos adicionais: [`ARCHITECTURE.md`](ARCHITECTURE.md).

---

## 1. Descrição do negócio (escopo)

O módulo é uma esteira de **inteligência de compras**: ingestão de cotações em PDF (uma ou várias por **sessão**), estruturação dos dados com **IA (Gemini)**, cruzamento dos itens com a **fonte da verdade** (materiais do orçamento vinculado ou catálogo global), **memória De/Para** por fornecedor, comparação de **cenários de compra** (pacote fechado vs. melhor preço item a item) e base para **histórico de preços** normalizados no banco.

---

## 2. Objetivos do sistema

- Reduzir digitação manual e permitir **vários PDFs em paralelo** sem travar a interface (fila assíncrona).
- Padronizar nomenclatura de mercado para a nomenclatura técnica via memória **De/Para** (`supplier_material_mappings`).
- Comparar cenários **A** (melhor fornecedor em pacote fechado) e **B** (melhor oferta por item entre todos).
- Registrar evolução de preços ao longo do tempo (view `supplier_price_history` no Postgres).

---

## 3. Atores

| Ator | Papel |
|------|--------|
| Comprador / analista de suprimentos | Cria **sessões**, faz upload em lote, concilia itens, valida extrações e decide compra. |
| Orçamentista / engenheiro | Monta o orçamento no canvas; a sessão pode ser **vinculada** a esse orçamento como fonte da verdade. |

---

## 4. Requisitos funcionais (RF)

| ID | Descrição | Onde no código / dados |
|----|-----------|-------------------------|
| RF01 | **Sessões de cotação** agrupam várias propostas. | Tabela `quotation_sessions`; actions [`quotationSessions.ts`](src/actions/quotationSessions.ts). |
| RF02 | **Upload em lote** de PDFs por sessão. | [`BatchDropzoneManager`](src/components/suppliers/BatchDropzoneManager.tsx) → Storage `fornecedores_pdfs` + linhas em `extraction_jobs`. |
| RF03 | **Extração assistida** (JSON de itens + observações). | [`geminiSupplierQuote.ts`](src/services/ai/geminiSupplierQuote.ts) — PDF enviado ao modelo como `inlineData`; também usado em [`supplierIngestion.ts`](src/actions/supplierIngestion.ts) no fluxo single-file. |
| RF04 | **Conciliação** automática (memória + IA semântica) e manual com fator de conversão. | [`autoMatchQuoteItems`](src/services/suppliers/autoMatchQuoteItems.ts), [`semanticMatch.ts`](src/services/ai/semanticMatch.ts), UI [`ConciliationCurationModal`](src/components/suppliers/ConciliationCurationModal.tsx); tabelas `supplier_quote_items`, `supplier_material_mappings`, `semantic_match_suggestions`. |
| RF05 | **Cenários A e B** de compra. | [`calculateScenariosAction`](src/actions/supplierQuotes.ts) + [`SessionScenariosView`](src/components/suppliers/SessionScenariosView.tsx) em `/fornecedores/sessao/[sessionId]/cenarios`. |
| RF06 | **Histórico de preços** por material. | View SQL `supplier_price_history` ([migração](supabase/migrations/20260409104000_create_supplier_price_history_view.sql)); UI de gráfico pode evoluir — a base está no banco. |

---

## 5. Requisitos não funcionais (RNF)

| ID | Descrição | Implementação |
|----|-----------|----------------|
| RNF01 | Processamento assíncrono da extração. | Jobs em `extraction_jobs`; processamento em [`POST /api/process-pdfs`](src/app/api/process-pdfs/route.ts) com `after(runExtractionJob)` (resposta 202 enfileirada). |
| RNF02 | Feedback em tempo real. | Publicação Realtime na tabela `extraction_jobs`; canal em [`SessionExtractionRealtime`](src/components/suppliers/SessionExtractionRealtime.tsx); toasts com **Sonner**. |
| RNF03 | Resiliência de lote: falha em um PDF não derruba os outros. | Um job por arquivo; status `error` isolado por linha. |
| RNF04 | Payload estável: não enviar PDF grande no corpo da Server Action. | Upload para Storage; API recebe apenas `job_id` (ou action recebe `filePath` string no fluxo legado). |
| RNF05 | ETA da fila. | Campo `estimated_time` em `extraction_jobs` (preenchimento conforme evolução do produto). |

---

## 6. Regras de domínio (RDN)

- **RDN01 — Fonte da verdade dinâmica**  
  - Sessão **com** `budget_id`: materiais elegíveis vêm do orçamento (grupos e avulsos).  
  - Sessão **sem** orçamento (modo global): catálogo `materials` do usuário.  
  Implementação: [`loadSystemMaterials`](src/services/suppliers/runExtractionJob.ts).

- **RDN02 — Preço normalizado**  
  Comparações usam `preco_unit / conversion_factor` quando o fator é válido (cenários e view de histórico).

- **RDN03 — Tolerância matemática**  
  A IA marca `alerta` quando `quantidade * preco_unit` diverge do `total_item` (prompt em `geminiSupplierQuote.ts`).

- **Cascata de match**  
  Memória exata → sugestão semântica (pode gerar `match_status = ia_suggested`) → aceite manual; metadados em `match_level`, `match_method`, `semantic_match_suggestions`.

---

## 7. Jornada do usuário (resumo)

1. Acessa **`/fornecedores`**, vê as sessões e clica em **Nova sessão de cotação** ([`FornecedoresHub`](src/components/suppliers/FornecedoresHub.tsx) + [`NewQuotationSessionModal`](src/components/suppliers/NewQuotationSessionModal.tsx)).
2. Abre **`/fornecedores/sessao/[sessionId]`**, arrasta PDFs; a fila aparece e atualiza em tempo real.
3. Opcionalmente navega para outras áreas do app; ao terminar o lote, recebe toast de conclusão.
4. Clica em **Abrir conciliação** — modal com itens, memória, sugestões IA e vínculo manual ([`ConciliationCurationModal`](src/components/suppliers/ConciliationCurationModal.tsx)).
5. Se a sessão tiver orçamento, acessa **Ver cenários** → **`/fornecedores/sessao/[sessionId]/cenarios`** para comparar A/B.
6. Para auditoria de preços ao longo do tempo, a visão canônica é a view `supplier_price_history` (consumo na UI conforme evolução).

---

## 8. Telas, rotas e componentes (mapa atual)

| Rota | Componentes principais |
|------|-------------------------|
| `/fornecedores` | [`FornecedoresHub`](src/components/suppliers/FornecedoresHub.tsx), `NewQuotationSessionModal` |
| `/fornecedores/sessao/[sessionId]` | [`SessionWorkspace`](src/components/suppliers/SessionWorkspace.tsx) → [`SessionExtractionRealtime`](src/components/suppliers/SessionExtractionRealtime.tsx), [`BatchDropzoneManager`](src/components/suppliers/BatchDropzoneManager.tsx), [`ExtractionCurationModal`](src/components/suppliers/ExtractionCurationModal.tsx), [`ConciliationCurationModal`](src/components/suppliers/ConciliationCurationModal.tsx) |
| `/fornecedores/sessao/[sessionId]/cenarios` | [`SessionScenariosView`](src/components/suppliers/SessionScenariosView.tsx) |

**Legado / auxiliar**

- [`SupplierPdfImporter`](src/components/SupplierPdfImporter.tsx): um PDF por vez (útil fora do fluxo de sessão).
- [`FornecedoresSuprimentosShell`](src/components/suppliers/FornecedoresSuprimentosShell.tsx), [`ConciliationTable`](src/components/suppliers/ConciliationTable.tsx), [`PurchaseScenariosPanel`](src/components/suppliers/PurchaseScenariosPanel.tsx): ainda existem no repositório; parte dos links antigos aponta para URLs do tipo `/fornecedores/trabalho?…` — **não** há rota App Router correspondente; a navegação suportada é a tabela acima.

**Entrada no módulo**

- Portal administrativo: tile Fornecedores → `router.push('/fornecedores')` ([`AdminPortal.tsx`](src/components/AdminPortal.tsx)).

---

## 9. Variáveis de ambiente relevantes

- `GEMINI_API_KEY` — extração de cotações.
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — cliente browser e SSR.
- `SUPABASE_SERVICE_ROLE_KEY` — operações do worker de extração quando necessário ([`createSupabaseServiceRoleClient`](src/lib/supabaseServer.ts)).

---

## 10. Schema versionado

Migrações em [`supabase/migrations/`](supabase/migrations/) definem tabelas do módulo, RLS, bucket de storage e views. Alterações de produto que mexem em conciliação ou histórico devem acompanhar novas migrações e, se necessário, este guia e o `ARCHITECTURE.md`.
