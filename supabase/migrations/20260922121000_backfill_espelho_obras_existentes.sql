-- ============================================================================
-- Backfill: o que o campo já levantou entra no portal do cliente.
--
-- A regra desta versão é que poste só atravessa para o portal depois que o
-- engenheiro aprova. Aplicada literalmente às marcações que já existiam, ela
-- criaria uma fila retroativa: a ACMA abriria com 24 postes esperando
-- aprovação de um trabalho que já foi feito, conferido e entregue. Não é
-- aprovação, é burocracia sobre o passado.
--
-- Então tudo que já estava registrado em campo no momento desta migration
-- entra como aprovado, em nome do engenheiro responsável pela obra. O portão
-- vale do deploy em diante, para o que o gerente marcar a partir de agora.
--
-- Escopo real em produção: só a ACMA - ILUMINAÇÃO tem marcações de campo. As
-- outras obras estão com zero instalações, então a condição não as alcança, e
-- nenhum acompanhamento novo é criado para elas. Escrito por condição e não
-- por id justamente para não depender disso: se houver outra obra na mesma
-- situação, ela recebe o mesmo tratamento.
--
-- O que NÃO é tocado: acompanhamento legado, marcado poste a poste à mão.
-- `ensure_work_tracking` recusa adotar esses, e o espelho nunca encosta em
-- linha de `tracked_posts` sem o prefixo 'orcamento:' ou 'campo:'.
-- ============================================================================

-- `protect_fields` exige que quem aprova seja o engenheiro logado, e migration
-- não tem ninguém logado. A saída NÃO é desligar a trava: é vestir o papel de
-- quem teria direito de fazer isso. O laço percorre uma obra por vez, assume a
-- identidade do engenheiro responsável por ela (`request.jwt.claims` local à
-- transação) e aprova só as marcações daquela obra. A trava continua de pé e
-- confere cada linha, exatamente como confere um clique de verdade.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT w.id AS work_id, w.engineer_id
      FROM public.works w
      JOIN public.work_pole_installations i ON i.work_id = w.id
     WHERE i.status = 'installed'
       AND i.approved_at IS NULL
  LOOP
    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', r.engineer_id, 'role', 'authenticated')::text,
      true
    );

    UPDATE public.work_pole_installations
       SET approved_at = now(),
           approved_by = r.engineer_id
     WHERE work_id = r.work_id
       AND status = 'installed'
       AND approved_at IS NULL;
  END LOOP;

  PERFORM set_config('request.jwt.claims', '', true);
END $$;

-- ---------------------------------------------------------------------------
-- A meta de iluminação que conta o mesmo poste duas vezes
--
-- O Portal tem um contador manual de iluminação pública, digitado à mão, sem
-- nenhuma fonte de campo que o alimente. Na ACMA ele está em "meta 24,
-- instalado 0", e 24 é exatamente o número de postes da obra: numa obra de
-- iluminação, os postes SÃO os pontos de luz. A mesma coisa entrou na conta
-- duas vezes.
--
-- O efeito é visível para o cliente: com os 24 postes acesos, a barra para em
-- 96%, e os 4 pontos que faltam são uma meta que nunca vai ser cumprida,
-- porque nada no sistema registra "ponto de iluminação instalado".
--
-- A meta é zerada, não o instalado preenchido. Preencher instalado = 24 seria
-- afirmar um fato de campo que ninguém registrou. Zerar afirma outro, que é
-- verdade: nesta obra a iluminação não se mede separada dos postes.
--
-- Escrito por condição e não por id: só alcança acompanhamento espelhado cuja
-- meta de iluminação é idêntica à contagem de postes e cujo instalado é zero,
-- que é a assinatura exata do duplo cômputo. É reversível pela tela: basta o
-- engenheiro redigitar o número no Portal.
UPDATE public.work_trackings t
   SET planned_public_lighting = NULL,
       updated_at = now()
 WHERE t.work_id IS NOT NULL
   AND COALESCE(t.public_lighting_installed, 0) = 0
   AND t.planned_public_lighting IS NOT NULL
   AND t.planned_public_lighting = (
     SELECT count(*) FROM public.budget_posts bp WHERE bp.budget_id = t.budget_id
   );

-- Zerar a meta muda o divisor do progresso, então o número é refeito.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.work_trackings WHERE work_id IS NOT NULL
  LOOP
    PERFORM public.refresh_work_tracking_progress(r.id);
  END LOOP;
END $$;

-- Cada UPDATE do laço dispara `trg_pole_installation_sync_tracking`, que monta
-- o portal daquela obra. O bloco abaixo é só conferência: se a ACMA (ou
-- qualquer obra com marcação de campo aprovada) tiver ficado sem poste aceso
-- no portal, a migration grita em vez de passar batido.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT w.id, w.name,
           count(*) FILTER (WHERE i.approved_at IS NOT NULL) AS aprovadas,
           (SELECT count(*) FROM public.tracked_posts tp
             JOIN public.work_trackings t ON t.id = tp.tracking_id
            WHERE t.work_id = w.id AND tp.status = 'Concluído') AS acesos
      FROM public.works w
      JOIN public.work_pole_installations i ON i.work_id = w.id
     WHERE i.status = 'installed'
     GROUP BY w.id, w.name
  LOOP
    IF r.aprovadas > 0 AND r.acesos = 0 THEN
      RAISE WARNING
        'Obra % (%): % marcacoes aprovadas e nenhum poste aceso no portal. '
        'Provavel acompanhamento legado no mesmo orcamento, que o espelho nao adota.',
        r.name, r.id, r.aprovadas;
    ELSE
      RAISE NOTICE 'Obra % (%): % aprovadas, % acesas no portal.',
        r.name, r.id, r.aprovadas, r.acesos;
    END IF;
  END LOOP;
END $$;
