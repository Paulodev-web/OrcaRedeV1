import React from 'react';
import { StyleSheet, Text, View } from '@react-pdf/renderer';

import { COLORS, CONTENT_WIDTH, FONTS, TYPE, columnWidths } from '../theme';
import { pad } from '../format';
import { Cell, HeaderRow, Row, type TableColumn } from '../components/table';
import { SectionHeader } from '../components/typography';
import type { SectionComponent } from './types';

/**
 * MATRIZ DE RESPONSABILIDADE — TABELA 02 da Maxif4.
 *
 * Item a item, marcando quem executa. `responsible: 'ambos'` marca as duas
 * colunas — é o caso de itens compartilhados, que na peça manual acabavam
 * ficando sem marcação nenhuma (item 5 da Maxif4 saiu em branco).
 */

const COLUMNS: TableColumn[] = [
  { key: 'order', label: 'Item', flex: 0.42 },
  { key: 'description', label: 'Descrição do serviço', flex: 4.1, align: 'left' },
  { key: 'contratada', label: 'Contratada', flex: 1.1 },
  { key: 'contratante', label: 'Contratante', flex: 1.1 },
];

const styles = StyleSheet.create({
  mark: {
    fontFamily: FONTS.display,
    fontWeight: 700,
    fontSize: TYPE.tableCell.size + 1.4,
    color: COLORS.white,
    textAlign: 'center',
  },
  legend: {
    width: CONTENT_WIDTH,
    fontFamily: FONTS.text,
    fontWeight: 400,
    fontSize: TYPE.caption.size + 0.6,
    color: COLORS.inkSoft,
    marginTop: 6,
  },
});

function Mark({ active }: { active: boolean }) {
  return <Text style={styles.mark}>{active ? 'X' : ' '}</Text>;
}

export const MatrizResponsabilidadeSection: SectionComponent = ({ data, config, tableNumber }) => {
  const widths = columnWidths(COLUMNS.map((column) => column.flex));
  const items = [...data.responsibilityMatrix].sort((a, b) => a.order - b.order);

  return (
    <View>
      <SectionHeader
        title={config.title}
        tableLabel={tableNumber ? `Tabela ${String(tableNumber).padStart(2, '0')}` : null}
      />

      <View style={{ width: CONTENT_WIDTH }}>
        <HeaderRow columns={COLUMNS} widths={widths} minHeight={22} />

        {items.map((item, index) => {
          const isContratada = item.responsible === 'contratada' || item.responsible === 'ambos';
          const isContratante = item.responsible === 'contratante' || item.responsible === 'ambos';

          return (
            <Row key={`resp-${index}`}>
              <Cell width={widths[0]}>{pad(index + 1)}</Cell>
              <Cell width={widths[1]} align="left">
                {item.description}
              </Cell>
              <Cell width={widths[2]}>
                <Mark active={isContratada} />
              </Cell>
              <Cell width={widths[3]} last>
                <Mark active={isContratante} />
              </Cell>
            </Row>
          );
        })}
      </View>

      <Text style={styles.legend}>
        Itens marcados nas duas colunas são de execução compartilhada entre Contratada e Contratante.
      </Text>
    </View>
  );
};
