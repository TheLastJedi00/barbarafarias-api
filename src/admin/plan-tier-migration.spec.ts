import { AdminService } from './admin.service';

/**
 * Spec 035 §7, decisão 2: todo aluno de hoje é Consultoria Particular Premium.
 * A rotina marca quem ainda não tem tier, uma vez, sem tocar em mais nada.
 */
describe('AdminService.migratePlanTiers', () => {
  function setup(users: Array<{ id: string; data: Record<string, any> }>) {
    const repository = {
      findAll: jest.fn().mockResolvedValue(users),
      mergeAll: jest.fn().mockResolvedValue(undefined),
    };
    const service = new AdminService(repository as any, {} as any);
    return { service, repository };
  }

  it('marca como private todo aluno sem tier', async () => {
    const { service, repository } = setup([
      { id: 'a1', data: { role: 'student', subscriptionPlan: 'ANNUAL' } },
      { id: 'a2', data: { role: 'student' } },
    ]);

    const report = await service.migratePlanTiers();

    expect(repository.findAll).toHaveBeenCalledWith('users');
    expect(repository.mergeAll).toHaveBeenCalledWith('users', [
      { id: 'a1', data: { planTier: 'private' } },
      { id: 'a2', data: { planTier: 'private' } },
    ]);
    expect(report).toEqual({ totalStudents: 2, updated: 2 });
  });

  it('é idempotente: quem já tem tier fica como está', async () => {
    const { service, repository } = setup([
      { id: 'a1', data: { role: 'student', planTier: 'weekly-group' } },
      { id: 'a2', data: { role: 'student', planTier: 'private' } },
    ]);

    const report = await service.migratePlanTiers();

    expect(repository.mergeAll).toHaveBeenCalledWith('users', []);
    expect(report.updated).toBe(0);
  });

  it('não toca em professora, gerente, candidata nem comprador da loja', async () => {
    const { service, repository } = setup([
      { id: 't1', data: { role: 'teacher' } },
      { id: 'm1', data: { role: 'manager' } },
      { id: 'c1', data: { role: 'candidate' } },
      { id: 'l1', data: { role: 'student', tier: 'modules' } },
      { id: 'legado', data: { isTeacher: true } },
    ]);

    await service.migratePlanTiers();

    expect(repository.mergeAll).toHaveBeenCalledWith('users', []);
  });
});
