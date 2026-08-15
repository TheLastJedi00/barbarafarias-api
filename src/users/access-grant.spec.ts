import { extendGrant, GRANT_DAYS } from './access-grant';

/**
 * A conta da concessão manual (spec 025). Três bordas, e a do meio é a que
 * carrega a promessa da tela: renovar antes não custa dias.
 */
describe('extendGrant', () => {
  const em = (data: string) => new Date(`${data}T12:00:00.000Z`);

  it('sem concessão nenhuma, conta 30 dias a partir de hoje', () => {
    expect(extendGrant(undefined, em('2026-08-14'))).toBe('2026-09-13');
  });

  it('com a concessão vigente, soma ao que ainda restava', () => {
    // A gerente recebe setembro no dia 20/08 e a concessão ia até 31/08: os 11
    // dias que o aluno já tinha pago não podem evaporar por ele ter renovado
    // cedo (spec 024 §2).
    expect(extendGrant('2026-08-31', em('2026-08-20'))).toBe('2026-09-30');
  });

  it('com a concessão vencida, parte de hoje — atraso não vira saldo', () => {
    // Quem parou em março e volta em agosto compra agosto, não a dívida.
    expect(extendGrant('2026-03-10', em('2026-08-14'))).toBe('2026-09-13');
  });

  it('renovar no último dia da concessão não perde nem ganha dia', () => {
    // Borda entre os dois ramos: vigente e hoje são a mesma data, e os dois
    // caminhos precisam dar no mesmo lugar.
    expect(extendGrant('2026-08-14', em('2026-08-14'))).toBe('2026-09-13');
  });

  it('atravessa a virada do ano sem ninguém contar dias', () => {
    expect(extendGrant(undefined, em('2026-12-20'))).toBe('2027-01-19');
  });

  it('renovar duas vezes seguidas vale dois meses', () => {
    const hoje = em('2026-08-14');
    const primeira = extendGrant(undefined, hoje);
    expect(extendGrant(primeira, hoje)).toBe('2026-10-13');
  });

  it('uma mensalidade vale 30 dias', () => {
    expect(GRANT_DAYS).toBe(30);
  });
});
