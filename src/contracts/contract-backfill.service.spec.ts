import { ContractBackfillService } from './contract-backfill.service';
import {
  TERMS_VERSION,
  TIER_TERMS_VERSION,
  buildTerms,
} from '../subscriptions/plan-terms';

/**
 * Backfill (spec 036 §6): gera o contrato dos aceites anteriores **só quando o
 * texto dá para reconstruir com exatidão**. O resto fica no relatório — um PDF
 * com o texto de hoje no lugar do aceito seria um documento falso.
 */
function build() {
  const acceptances = {
    findAll: jest.fn().mockResolvedValue([
      {
        id: 'ac-legado',
        studentId: 'a1',
        studentName: 'Ana',
        studentEmail: 'ana@x.com',
        plan: 'SEMIANNUAL',
        planLabel: 'Semestral',
        totalAmount: 1371.84,
        installments: 6,
        installmentAmount: 228.64,
        termsVersion: TERMS_VERSION,
        acceptedAt: '2026-10-10T12:00:00.000Z',
      },
      {
        id: 'ac-velho',
        studentId: 'a2',
        studentName: 'Bia',
        studentEmail: 'bia@x.com',
        plan: 'MONTHLY',
        planLabel: 'Mensal',
        totalAmount: 240,
        installments: 1,
        installmentAmount: 240,
        termsVersion: '2026-08-1',
        acceptedAt: '2026-08-10T12:00:00.000Z',
      },
      {
        id: 'ac-tier',
        studentId: 'a3',
        studentName: 'Caio',
        studentEmail: 'caio@x.com',
        plan: 'PACKAGE',
        planLabel: 'Premium — pacote',
        totalAmount: 1800,
        installments: 1,
        installmentAmount: 1800,
        termsVersion: TIER_TERMS_VERSION,
        acceptedAt: '2026-11-20T12:00:00.000Z',
      },
    ]),
  };
  const purchases = {
    findAll: jest.fn().mockResolvedValue([
      {
        id: 'p1',
        userId: 'a4',
        titleSnapshot: 'Módulo 1',
        priceSnapshot: 97,
        method: 'PIX',
        termsVersion: '1.0',
        status: 'PAID',
        createdAt: '2026-10-01T12:00:00.000Z',
      },
    ]),
  };
  const users = {
    findById: jest.fn(async (id: string) => ({
      id,
      fullName: `Pessoa ${id}`,
      email: `${id}@x.com`,
    })),
  };
  const legal = {
    getVersion: jest.fn().mockResolvedValue({
      title: 'Termo de Compra',
      markdown: '## 1. Acesso\n\nVale 90 dias.',
    }),
  };
  const contracts = {
    record: jest.fn(async (input: any) => input),
    findById: jest.fn().mockResolvedValue(null),
  };
  const service = new ContractBackfillService(
    acceptances as any,
    purchases as any,
    users as any,
    legal as any,
    contracts as any,
  );
  return { service, contracts, legal };
}

describe('ContractBackfillService (spec 036)', () => {
  it('gera os que dão para reconstruir e relata os demais', async () => {
    const { service, contracts } = build();
    const report = await service.run();

    expect(report).toEqual({
      created: 2,
      alreadyExisted: 0,
      skipped: [
        {
          kind: 'PLAN',
          refId: 'ac-velho',
          reason: expect.stringContaining('2026-08-1'),
        },
        {
          kind: 'PLAN',
          refId: 'ac-tier',
          reason: expect.stringContaining('preço'),
        },
      ],
    });
    const gravados = contracts.record.mock.calls.map(([input]) => input);
    expect(gravados.map((c) => `${c.kind}:${c.refId}`)).toEqual([
      'PLAN:ac-legado',
      'STORE:p1',
    ]);
    expect(gravados[0]).toMatchObject({
      clauses: buildTerms('SEMIANNUAL').clauses,
      acceptedAt: '2026-10-10T12:00:00.000Z',
    });
    expect(gravados[1]).toMatchObject({
      studentName: 'Pessoa a4',
      clauses: [{ title: '1. Acesso', body: 'Vale 90 dias.' }],
    });
  });

  it('idempotente: contrato que já existe não é gravado de novo', async () => {
    const { service, contracts } = build();
    contracts.findById.mockResolvedValue({ id: 'x' });
    const report = await service.run();
    expect(report.created).toBe(0);
    expect(report.alreadyExisted).toBe(4);
    expect(contracts.record).not.toHaveBeenCalled();
  });
});
