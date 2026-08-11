import { SubscriptionService } from './subscription.service';
import { PlanAcceptance } from './plan-acceptance.entity';
import {
  PAYMENT_METHODS,
  SUBSCRIPTION_PLANS,
  SUBSCRIPTION_STATUS,
  Subscription,
} from './subscription.entity';

/**
 * "Quem comprou" na tela de contratos (spec 023 P3).
 *
 * O aceite é gravado **antes** da cobrança, de propósito: a janela alternativa
 * — aluna debitada sem registro de que concordou — é a pior das duas. A
 * consequência é que uma cobrança recusada deixa um aceite na lista mesmo
 * assim, e a gerente lia aquilo como uma compra.
 *
 * A decisão do dono foi fazer a tela **ser** "quem comprou". Isso obriga a
 * responder por cada aceite, e a resposta não pode ser gravada nele: um
 * registro probatório alterado depois de criado não prova mais nada. Daí ser
 * calculada na leitura, contra a assinatura de hoje — com o cuidado de dizer
 * "não sei" quando a assinatura já não descreve aquele aceite.
 */
function aceite(overrides: Partial<PlanAcceptance> = {}): PlanAcceptance {
  return new PlanAcceptance({
    id: 'aceite-1',
    studentId: 'aluno-1',
    studentName: 'Ana',
    studentEmail: 'ana@example.com',
    plan: SUBSCRIPTION_PLANS.ANNUAL,
    planLabel: 'Anual',
    totalAmount: 2637.58,
    installments: 12,
    installmentAmount: 219.8,
    termsVersion: '2026-08-2',
    acceptedAt: '2026-08-11T12:00:00.000Z',
    ...overrides,
  });
}

function plano(overrides: Partial<Subscription> = {}): Subscription {
  return new Subscription({
    id: 'aluno-1',
    studentId: 'aluno-1',
    plan: SUBSCRIPTION_PLANS.ANNUAL,
    status: SUBSCRIPTION_STATUS.PENDING,
    paymentMethod: PAYMENT_METHODS.CREDIT_CARD,
    totalAmount: 2160,
    installments: 12,
    installmentAmount: 180,
    paidInstallments: 0,
    charges: [],
    startDate: '2026-08-11',
    ...overrides,
  });
}

function build(acceptances: PlanAcceptance[], subscriptions: Subscription[]) {
  return new SubscriptionService(
    { findAll: jest.fn().mockResolvedValue(subscriptions) } as any,
    {} as any,
    {} as any,
    { findAll: jest.fn().mockResolvedValue(acceptances) } as any,
    {} as any,
    {} as any,
    {} as any,
  );
}

describe('listAcceptances — o aceite virou compra?', () => {
  it('pagou: a assinatura vigente tem parcela quitada', async () => {
    const service = build([aceite()], [plano({ paidInstallments: 12 })]);

    const [linha] = await service.listAcceptances();

    expect(linha.purchase).toBe('PAID');
  });

  it('não pagou: concordou e a cobrança não passou', async () => {
    // É o caso que criava a leitura errada — o aceite existe, a compra não.
    const service = build([aceite()], [plano({ paidInstallments: 0 })]);

    const [linha] = await service.listAcceptances();

    expect(linha.purchase).toBe('UNPAID');
  });

  it('sem assinatura nenhuma, também não pagou', async () => {
    const service = build([aceite()], []);

    const [linha] = await service.listAcceptances();

    expect(linha.purchase).toBe('UNPAID');
  });

  it('aceite antigo não responde pelo estado de hoje', async () => {
    // A aluna tem **uma** assinatura, reescrita a cada contratação. O aceite
    // anterior descreve um plano que não existe mais; afirmar "pagou" ou "não
    // pagou" por ele seria inventar.
    const service = build(
      [
        aceite({ id: 'antigo', acceptedAt: '2026-01-01T10:00:00.000Z' }),
        aceite({ id: 'novo', acceptedAt: '2026-08-11T12:00:00.000Z' }),
      ],
      [plano({ paidInstallments: 12 })],
    );

    const linhas = await service.listAcceptances();

    expect(linhas.find((l) => l.id === 'antigo')!.purchase).toBe('SUPERSEDED');
    expect(linhas.find((l) => l.id === 'novo')!.purchase).toBe('PAID');
  });

  it('plano divergente no aceite vigente vira "não sei", não "comprou"', async () => {
    const service = build(
      [aceite()],
      [plano({ plan: SUBSCRIPTION_PLANS.MONTHLY, paidInstallments: 3 })],
    );

    const [linha] = await service.listAcceptances();

    // Não deveria acontecer — trocar de plano grava aceite novo. Se acontecer,
    // admitir a dúvida é melhor que sustentar uma compra que não se comprova.
    expect(linha.purchase).toBe('SUPERSEDED');
  });

  it('não altera o registro gravado', async () => {
    const original = aceite();
    const service = build([original], [plano({ paidInstallments: 12 })]);

    await service.listAcceptances();

    // O desfecho é da leitura, não do documento: um registro probatório que
    // muda depois de criado não prova mais nada.
    expect('purchase' in original).toBe(false);
  });
});
