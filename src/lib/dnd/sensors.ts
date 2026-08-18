import { KeyboardSensor, PointerSensor } from '@dnd-kit/react';
import { PointerActivationConstraints } from '@dnd-kit/dom';

/**
 * Quantos pixels o ponteiro precisa andar para o gesto virar arrasto.
 *
 * O mesmo número serve de limiar para "isso foi um clique" nos cartões: acima
 * dele o dnd-kit assume o gesto e o `pointerup` nem chega ao React; abaixo dele
 * o cartão abre. Se os dois valores divergirem sobra uma faixa morta em que o
 * clique não abre nada e o arrasto não acontece.
 */
export const DRAG_ACTIVATION_DISTANCE = 6;

/** Quanto tempo o dedo fica parado antes de o cartão sair junto, no toque. */
const TOUCH_ACTIVATION_DELAY = 250;

/**
 * Sensores dos quadros de cartões (Dashboard do OrçaRede e Esteira).
 *
 * O padrão do dnd-kit ativa o arrasto por DISTÂNCIA **ou** por TEMPO — 200 ms
 * de dedo/mouse parado já começam a arrastar, mesmo sem mover um pixel. Isso
 * quebra o clique: assim que o arrasto começa, o `PointerSensor` captura o
 * ponteiro e mata o `pointerup` na fase de captura, então o `onPointerUp` que
 * abre o cartão nunca roda. Na prática o cartão só abria se o clique fosse mais
 * rápido que 200 ms; qualquer clique normal "prendia" o cartão e não abria
 * nada.
 *
 * Aqui o mouse (e a caneta) ativa só por distância — clique abre, arrastar
 * arrasta — e o toque mantém o atraso, porque no toque não existe outra forma
 * de distinguir arrastar um cartão de rolar a página.
 */
export const cardDragSensors = [
  PointerSensor.configure({
    activationConstraints(event) {
      if (event.pointerType === 'touch') {
        return [
          new PointerActivationConstraints.Delay({
            value: TOUCH_ACTIVATION_DELAY,
            tolerance: 5,
          }),
        ];
      }

      return [
        new PointerActivationConstraints.Distance({ value: DRAG_ACTIVATION_DISTANCE }),
      ];
    },
  }),
  KeyboardSensor,
];
