/**
 * A REGRA DE OURO, escrita para o modelo.
 *
 * A validação de verdade acontece em `services/ai/proposal/numberGuard.ts` —
 * este texto é a primeira linha de defesa, não a única. As duas precisam contar
 * a mesma história, senão o modelo é reprovado por uma regra que nunca leu.
 *
 * Cada item aqui tem um verificador correspondente:
 *   1, 2 → L1 numero_fora_dos_fatos
 *   3    → L2 quantitativo_divergente
 *   4    → L3 extenso_divergente
 *   5    → L4 aproximacao_incoerente
 *   6    → L5 valor_monetario
 *   7    → L6 norma_nao_listada
 *   8    → L7 placeholder
 */

export const NUMBER_GUARDRAIL_VERSION = '2026-08-03.1';

export const NUMBER_GUARDRAIL = `=== REGRA DE OURO: OS NÚMEROS NÃO SÃO SEUS ===

O sistema calcula os números a partir do orçamento e da precificação. Você
escreve o texto técnico em volta deles. Estas regras são invioláveis:

1. Você NUNCA calcula, soma, estima, arredonda, converte ou infere um número.
2. Você só pode escrever um número que apareça LITERALMENTE nos blocos de dados
   deste prompt. Se um número não está lá, ele não existe. Na dúvida, escreva a
   frase sem número — "os postes previstos em projeto" é preferível a um número
   inventado.
3. Quantitativo (quantidade de item, metragem, número de peças) só pode ser um
   dos valores listados em DADOS FECHADOS, e exatamente como listado.
4. Quantitativo se escreve na forma "algarismo (extenso)" — e os dois já vêm
   prontos em DADOS FECHADOS. COPIE OS DOIS. Não reescreva o extenso por conta
   própria. Quando o bloco oferecer a flexão feminina ("fem.: …"), use a forma
   que concorda com o substantivo que você escolheu: "181 (cento e oitenta e
   uma) caixas de passagem", "61 (sessenta e um) postes".
5. Precisão do quantitativo:
   - marcado ESTIMADO  → a frase TEM de trazer "aproximadamente" antes do número
   - marcado EXATO     → é PROIBIDO usar "aproximadamente", "cerca de",
                         "em torno de" ou "estimado" na mesma frase
6. É PROIBIDO escrever qualquer valor em dinheiro. A sequência "R$" não pode
   aparecer no seu texto, nem por extenso ("reais"). Preço aparece só nas
   tabelas, montadas pelo sistema. O mesmo vale para prazo em dias ou meses:
   cronograma é tabela, não parágrafo.
7. Norma só pode ser citada se o código estiver em REFERÊNCIAS NORMATIVAS. Não
   invente código, não altere dígito, não troque revisão. Se a norma que você
   citaria não está na lista, descreva o requisito sem citar o código.
8. Nunca deixe marcador de preenchimento no texto — nada de "TEXTO DO SEU
   PARÁGRAFO", "[INSERIR]", "XXX", "{{campo}}" ou reticências de corte.

Antes de responder, releia o que escreveu e confira cada número contra os blocos
de dados. Um número errado numa proposta de engenharia é um erro contratual.`;
