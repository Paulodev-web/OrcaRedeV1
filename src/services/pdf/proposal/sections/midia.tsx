import React from 'react';

import { MediaGrid } from '../components/media';
import { SectionHeader } from '../components/typography';
import type { SectionComponent } from './types';

/**
 * Seções de mídia: SEU PROJETO, LOCALIZAÇÃO DA OBRA e FOTOS DA OBRA.
 *
 * Todas têm a mesma anatomia — título da seção e a grade de fotos agrupada por
 * `ProposalMedia.group`, com legenda por foto. Na Andora, "SEU PROJETO" e
 * "LOCALIZAÇÃO DA OBRA" dividem a mesma página e o agrupamento aparece como
 * rótulo azul espaçado acima de cada conjunto ("MAPA ARQUITETÔNICO DO
 * EMPREENDIMENTO", "REDES DE MT/BT E SUBEST. TRANSFORMADORAS").
 *
 * ── Por que estas seções devolvem Fragment e não `<View>` ──────────────────
 *
 * O `ProposalDocument` já envolve cada seção em uma `<View>`. Um segundo
 * wrapper aqui quebraria a paginação de um jeito nada óbvio: no `splitNodes`
 * do react-pdf, quando um filho `wrap={false}` não cabe no resto da folha, o
 * pai é dividido — e se o pai fica sem nenhum filho na página atual, existe
 * uma regra de resgate ("se a página está vazia, mantém o pai aqui mesmo") que
 * olha só para os irmãos DENTRO do pai, não para a posição real na folha.
 *
 * Com dois wrappers, o bloco de fotos caía nessa regra e era mantido à força
 * na página, transbordando por cima do rodapé e deixando a folha seguinte em
 * branco. Com um wrapper só, a decisão sobe até a `<Page>`, onde já existem
 * irmãos, e o bloco desce inteiro para a próxima página — que é o correto.
 */

export const SeuProjetoSection: SectionComponent = ({ data, config }) => (
  <>
    {/* O título entra pelo `header` para ficar amarrado à primeira linha de fotos. */}
    <MediaGrid media={data.media.seuProjeto} header={<SectionHeader title={config.title} />} />
  </>
);

export const LocalizacaoSection: SectionComponent = ({ data, config }) => (
  <>
    <MediaGrid media={data.media.localizacao} header={<SectionHeader title={config.title} />} />
  </>
);

export const FotosObraSection: SectionComponent = ({ data, config }) => (
  <>
    <MediaGrid media={data.media.fotosObra} header={<SectionHeader title={config.title} />} />
  </>
);
