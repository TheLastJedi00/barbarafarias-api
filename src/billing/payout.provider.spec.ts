import { ManualPixProvider } from './payout.provider';

/**
 * Repasse sem chave PIX (spec 018 Task 128).
 *
 * O convite por e-mail criou uma janela que antes não existia: entre o convite
 * e o onboarding, a professora está cadastrada e **sem** chave. O fechamento do
 * mês não pode gerar uma instrução apontando para `undefined` — quem for
 * transferir precisa saber que falta o dado, e não receber uma linha errada
 * com cara de certa.
 */
describe('ManualPixProvider', () => {
  const provider = new ManualPixProvider();

  it('instrui a transferência quando há chave', async () => {
    const result = await provider.createPixPayout({
      teacherId: 't-1',
      teacherName: 'Ana',
      pixKey: 'ana@x.com',
      amount: 1234.5,
      reference: '2026-08',
    });

    expect(result.message).toContain('ana@x.com');
    expect(result.message).toContain('1234.50');
  });

  it('avisa a falta da chave em vez de mandar transferir para lugar nenhum', async () => {
    const result = await provider.createPixPayout({
      teacherId: 't-2',
      teacherName: 'Nova',
      amount: 300,
      reference: '2026-08',
    });

    expect(result.message).toMatch(/sem chave PIX/i);
    expect(result.message).not.toContain('undefined');
    expect(result.message).not.toMatch(/^Transfira/);
  });
});
