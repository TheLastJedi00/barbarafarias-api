/**
 * A conta da concessão manual de acesso (spec 025).
 *
 * A gerente recebe a mensalidade por fora do gateway — dinheiro, transferência,
 * um PIX direto — e registra isso ligando o toggle na ficha do aluno. O gesto
 * não é "marcar como bom pagador": é **um mês recebido**, e um mês recebido
 * vale 30 dias de acesso.
 *
 * Função pura, separada do service, porque é aqui que mora a única regra que
 * pode errar em silêncio — e testar a regra pela rota exigiria montar o mundo
 * inteiro para conferir uma soma de datas.
 */

/** Quanto vale uma mensalidade recebida à mão. */
export const GRANT_DAYS = 30;

/**
 * Empurra a concessão para `max(vigente, hoje) + 30 dias`.
 *
 * O `max` é a parte que importa, e é emprestada do PIX pré-pago (spec 024 §2):
 * **renovar antes não pode custar dias.** Se a gerente recebe a mensalidade de
 * setembro no dia 20 de agosto e a concessão vai até 31 de agosto, somar a
 * partir de "hoje" queimaria os 11 dias que o aluno já tinha pago. Somar a
 * partir do fim vigente é o que torna verdade a frase que a tela promete.
 *
 * Concessão **vencida** não é saldo: quem parou de pagar em março e volta em
 * agosto compra agosto, não a dívida acumulada. Daí o `max` com hoje.
 */
export function extendGrant(vigente: string | undefined, hoje: Date): string {
  const dia = hoje.toISOString().slice(0, 10);
  const base = vigente && vigente > dia ? vigente : dia;
  return addDays(base, GRANT_DAYS);
}

/**
 * Soma dias a uma data 'YYYY-MM-DD'. `Date.UTC` normaliza o estouro de mês
 * sozinho — 20/08 + 30 vira 19/09 sem ninguém contar os dias de agosto.
 *
 * UTC, e não hora local, pelo mesmo motivo do resto do sistema: a data é um
 * dia de calendário, não um instante, e o fuso do servidor não pode mudar de
 * qual dia se trata.
 */
function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10);
}
