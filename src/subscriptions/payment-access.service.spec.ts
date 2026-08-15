import { ForbiddenException } from '@nestjs/common';
import { PaymentAccessService } from './payment-access.service';
import { User } from '../users/user.entity';

/**
 * O sintoma relatado na spec 025, no lugar exato em que ele aparecia.
 *
 * A gerente liga o toggle de pagamento, a tela confirma, e a professora
 * continua sem conseguir agendar — "pagamento pendente". A causa não estava no
 * agendamento: o `isPaying` do corpo do `PUT` era descartado quando o aluno
 * tinha assinatura, e o documento nunca mudava. Este arquivo é a rede que
 * impede a volta, e ele mora aqui de propósito — é aqui que a professora
 * esbarrava.
 */
describe('PaymentAccessService (spec 025)', () => {
  const hoje = new Date('2026-08-14T12:00:00.000Z');
  let users: { findById: jest.Mock };
  let service: PaymentAccessService;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(hoje);
    users = { findById: jest.fn() };
    service = new PaymentAccessService(users as any);
  });

  afterEach(() => jest.useRealTimers());

  const inadimplente = (extra: Partial<User> = {}) =>
    new User({
      id: 'a1',
      fullName: 'Ana',
      isPaying: false,
      subscriptionStatus: 'PAST_DUE',
      ...extra,
    });

  it('bloqueia o aluno sem concessão nenhuma', async () => {
    users.findById.mockResolvedValue(inadimplente());
    await expect(service.assertStudentIsPaying('a1')).rejects.toThrow(
      ForbiddenException,
    );
  });

  /**
   * O caso da spec. A assinatura continua `PAST_DUE` — e continua certa, porque
   * o gateway de fato não recebeu nada. O que mudou é que a gerente recebeu por
   * fora e registrou. As duas coisas são verdade ao mesmo tempo, e é por isso
   * que a concessão é campo próprio em vez de uma correção do espelho.
   */
  it('libera o agendamento de quem tem concessão vigente, mesmo em PAST_DUE', async () => {
    users.findById.mockResolvedValue(
      inadimplente({ manualAccessUntil: '2026-09-13' }),
    );
    await expect(service.assertStudentIsPaying('a1')).resolves.toBeUndefined();
  });

  it('volta a bloquear quando a concessão vence', async () => {
    users.findById.mockResolvedValue(
      inadimplente({ manualAccessUntil: '2026-08-13' }),
    );
    await expect(service.assertStudentIsPaying('a1')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('o alerta da professora acompanha a concessão', async () => {
    users.findById
      .mockResolvedValueOnce(
        inadimplente({ id: 'a1', manualAccessUntil: '2026-09-13' }),
      )
      .mockResolvedValueOnce(inadimplente({ id: 'a2' }));

    const situacao = await service.paymentStatusOf(['a1', 'a2']);

    expect(situacao.get('a1')).toBe(true);
    expect(situacao.get('a2')).toBe(false);
  });
});
