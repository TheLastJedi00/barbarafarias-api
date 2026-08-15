import { hasPaidAccess } from './paid-access';

/**
 * Acesso pago (spec 023 P1).
 *
 * O caso que motivou tudo: a aluna paga o Anual — R$ 2.280 debitados de uma
 * vez, divididos em 12 pelo emissor — e cancela no terceiro mês. Cancelar não
 * devolve dinheiro nem interrompe a fatura dela; o banco segue cobrando. Um
 * acesso que morresse ali seria cobrar por um ano e entregar três meses.
 */
describe('hasPaidAccess', () => {
  const em = (data: string) => new Date(`${data}T12:00:00.000Z`);

  it('libera quem está em dia, sem depender de data', () => {
    expect(hasPaidAccess({ isPaying: true })).toBe(true);
    expect(hasPaidAccess({ isPaying: true }, em('2030-01-01'))).toBe(true);
  });

  it('libera quem cancelou dentro do período que comprou', () => {
    expect(
      hasPaidAccess({ isPaying: false, accessUntil: '2027-08-11' }, em('2026-11-20')),
    ).toBe(true);
  });

  it('vale o dia inteiro do vencimento', () => {
    // Cortar às 00:00 tiraria da aluna o último dia que ela pagou.
    expect(
      hasPaidAccess({ isPaying: false, accessUntil: '2026-08-11' }, em('2026-08-11')),
    ).toBe(true);
  });

  it('fecha no dia seguinte, sem ninguém precisar virar a chave', () => {
    // A data é gravada uma vez e a comparação é a cada leitura: não há tarefa
    // agendada para parar de rodar sem ninguém notar.
    expect(
      hasPaidAccess({ isPaying: false, accessUntil: '2026-08-11' }, em('2026-08-12')),
    ).toBe(false);
  });

  it('bloqueia inadimplente sem período comprado', () => {
    expect(hasPaidAccess({ isPaying: false })).toBe(false);
  });

  it('trata ausência de `isPaying` como acesso, para quem nunca assinou', () => {
    // Aluno anterior à spec 012 não tem o campo, e a barreira nunca foi dele.
    expect(hasPaidAccess({})).toBe(true);
  });

  /**
   * Concessão manual (spec 025). A gerente recebe a mensalidade por fora do
   * gateway e liga o toggle: é o mesmo fato — um mês recebido —, registrado à
   * mão.
   */
  describe('concessão da gerente', () => {
    it('libera quem tem concessão vigente, sem assinatura nenhuma', () => {
      expect(
        hasPaidAccess(
          { isPaying: false, manualAccessUntil: '2026-09-13' },
          em('2026-08-14'),
        ),
      ).toBe(true);
    });

    it('não libera com a concessão vencida', () => {
      expect(
        hasPaidAccess(
          { isPaying: false, manualAccessUntil: '2026-08-13' },
          em('2026-08-14'),
        ),
      ).toBe(false);
    });

    /**
     * O motivo de o campo existir. `syncUser` reescreve `accessUntil` a cada
     * evento do gateway — aqui ele chegou como `null`, que é o que uma
     * assinatura sem parcela paga produz. Se a concessão morasse naquele
     * campo, este webhook a teria apagado, e a gerente descobriria pela
     * professora que não consegue agendar.
     */
    it('sobrevive ao webhook que zera o espelho da assinatura', () => {
      const aluno = {
        isPaying: false,
        accessUntil: undefined,
        manualAccessUntil: '2026-09-13',
      };
      expect(hasPaidAccess(aluno, em('2026-08-14'))).toBe(true);
    });

    it('basta uma das metades: a da assinatura vale sozinha', () => {
      expect(
        hasPaidAccess(
          { isPaying: false, accessUntil: '2027-08-11', manualAccessUntil: '2026-01-01' },
          em('2026-08-14'),
        ),
      ).toBe(true);
    });
  });
});
