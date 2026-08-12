/**
 * Estado "sem modal" do slot `card`. Obrigatório: sem um `default`, o Next
 * renderiza 404 no slot em qualquer rota que a interceptadora não cobre —
 * inclusive a própria `/tarefas`.
 */
export default function CardSlotDefault() {
  return null;
}
