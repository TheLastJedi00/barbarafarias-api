/**
 * Quem tem acesso pago, num lugar só (spec 023 P1).
 *
 * Antes bastava ler `isPaying`, e por isso a regra estava copiada em quatro
 * pontos — guard, feedbacks e as duas leituras da professora. Com o
 * cancelamento passando a **preservar** o que já foi comprado, um booleano
 * deixou de bastar: a aluna que cancela o Anual no terceiro mês não está
 * pagando e continua tendo direito ao que pagou.
 *
 * Daí `accessUntil`. E daí este arquivo: quatro cópias de uma regra de duas
 * partes divergem na primeira mudança, e a que ficar para trás ou tranca quem
 * pagou ou libera quem não pagou.
 *
 * **Envelhece sozinho, de propósito.** A data é gravada uma vez, no
 * cancelamento, e a comparação acontece a cada leitura — sem tarefa agendada
 * para virar a chave depois, que é o tipo de peça que ninguém percebe quando
 * para de rodar.
 */
export function hasPaidAccess(
  user: {
    isPaying?: boolean;
    accessUntil?: string;
    manualAccessUntil?: string;
  },
  hoje: Date = new Date(),
): boolean {
  if (user.isPaying !== false) return true;

  // Comparação por data, não por instante: o acesso vale o **dia** inteiro do
  // vencimento. Cortar às 00:00 tiraria da aluna o último dia que ela comprou.
  const dia = hoje.toISOString().slice(0, 10);

  // Duas metades, e basta uma. A da assinatura é o que o gateway confirmou; a
  // manual é o que a gerente recebeu por fora e registrou (spec 025). Somar
  // aqui é o que permite ao `syncUser` continuar reescrevendo o espelho da
  // assinatura sem derrubar a concessão dela.
  if (user.accessUntil && dia <= user.accessUntil) return true;
  if (user.manualAccessUntil && dia <= user.manualAccessUntil) return true;
  return false;
}
