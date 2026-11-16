import { ModuleAccessService } from './module-access.service';

const DAY = 24 * 60 * 60 * 1000;
const ago = (d: number) => new Date(Date.now() - d * DAY).toISOString();
const ahead = (d: number) => new Date(Date.now() + d * DAY).toISOString();

const student = { sub: 'u1', email: 'a@x.com', role: 'student' as const };

function setup(
  user: Record<string, unknown> | null,
  purchases: unknown[] = [],
) {
  const users = { findById: jest.fn().mockResolvedValue(user) };
  const repo = { findByUser: jest.fn().mockResolvedValue(purchases) };
  return {
    service: new ModuleAccessService(users as any, repo as any),
    users,
    repo,
  };
}

const compra = (overrides: Record<string, unknown> = {}) => ({
  id: 'c1',
  userId: 'u1',
  productId: 'p1',
  kind: 'module',
  level: 'A1',
  moduleId: 'm1',
  status: 'PAID',
  paidAt: ago(1),
  accessUntil: ahead(89),
  ...overrides,
});

describe('ModuleAccessService (spec 032 §4)', () => {
  it('professora e gerente veem tudo, sem ler o banco', async () => {
    const { service, users } = setup(null);
    for (const role of ['teacher', 'manager'] as const) {
      expect(await service.resolve({ ...student, role }, 'B2', 'mX')).toEqual({
        mode: 'full',
      });
    }
    expect(users.findById).not.toHaveBeenCalled();
  });

  it('assinante em dia do mesmo nível: acesso completo', async () => {
    const { service } = setup({ level: 'A1', isPaying: true });
    expect(await service.resolve(student, 'A1', 'm1')).toEqual({
      mode: 'full',
    });
  });

  it('assinante de outro nível com compra válida: acesso da loja', async () => {
    const { service } = setup({ level: 'B1', isPaying: true }, [compra()]);
    expect(await service.resolve(student, 'A1', 'm1')).toEqual({
      mode: 'store',
      purchaseId: 'c1',
      accessUntil: expect.any(String),
    });
  });

  it('comprador com compra válida do módulo: acesso da loja', async () => {
    const { service } = setup({ tier: 'modules', isPaying: false }, [compra()]);
    expect((await service.resolve(student, 'A1', 'm1'))?.mode).toBe('store');
  });

  it.each([
    ['vencida', compra({ accessUntil: ago(1) })],
    ['reembolsada', compra({ status: 'REFUNDED' })],
    ['contestada', compra({ status: 'CHARGED_BACK' })],
    ['pendente', compra({ status: 'PENDING', paidAt: undefined })],
    ['de outro módulo', compra({ moduleId: 'm2' })],
  ])('compra %s não dá acesso', async (_label, purchase) => {
    const { service } = setup({ tier: 'modules', isPaying: false }, [purchase]);
    expect(await service.resolve(student, 'A1', 'm1')).toBeNull();
  });

  it('aluno do plano em atraso no próprio nível: marcado como pagamento pendente', async () => {
    const { service } = setup({ level: 'A1', isPaying: false });
    expect(await service.resolve(student, 'A1', 'm1')).toEqual({
      mode: 'payment-pending',
    });
  });

  it('comprador da loja sem compra: sem acesso (não é "pagamento pendente")', async () => {
    const { service } = setup({
      level: 'A1',
      tier: 'modules',
      isPaying: false,
    });
    expect(await service.resolve(student, 'A1', 'm1')).toBeNull();
  });

  it('usuário sem ficha: sem acesso', async () => {
    const { service } = setup(null);
    expect(await service.resolve(student, 'A1', 'm1')).toBeNull();
  });
});
