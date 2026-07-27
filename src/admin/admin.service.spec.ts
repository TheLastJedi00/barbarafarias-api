import { AdminService } from './admin.service';
import { ROLES } from '../types/role';

describe('AdminService.migrateRoles', () => {
  let service: AdminService;
  let repository: {
    findAll: jest.Mock;
    mergeAll: jest.Mock;
    moveAll: jest.Mock;
  };

  function setup(users: any[], credentials: any[], agenda: any[] = []) {
    repository = {
      findAll: jest.fn((collection: string) => {
        if (collection === 'users') return Promise.resolve(users);
        if (collection === 'credentials') return Promise.resolve(credentials);
        return Promise.resolve(agenda);
      }),
      mergeAll: jest.fn().mockResolvedValue(undefined),
      moveAll: jest.fn().mockResolvedValue(undefined),
    };
    service = new AdminService(repository as any);
  }

  function updatesFor(collection: string) {
    const call = repository.mergeAll.mock.calls.find(
      ([name]) => name === collection,
    );
    return call ? call[1] : [];
  }

  it('migra isTeacher para role em users e credentials', async () => {
    setup(
      [
        { id: 'u1', data: { isTeacher: true } },
        { id: 'u2', data: { isTeacher: false } },
      ],
      [
        { id: 'u1', data: { role: undefined } },
        { id: 'u2', data: { role: undefined } },
      ],
    );

    const report = await service.migrateRoles();

    expect(report).toMatchObject({
      totalUsers: 2,
      updatedUsers: 2,
      updatedCredentials: 2,
      missingCredentials: [],
    });
    expect(updatesFor('users')).toEqual([
      { id: 'u1', data: { role: ROLES.TEACHER } },
      { id: 'u2', data: { role: ROLES.STUDENT } },
    ]);
  });

  it('é idempotente: nada a fazer quando tudo já está sincronizado', async () => {
    setup(
      [{ id: 'u1', data: { isTeacher: true, role: ROLES.TEACHER } }],
      [{ id: 'u1', data: { role: ROLES.TEACHER } }],
    );

    const report = await service.migrateRoles();

    expect(report.updatedUsers).toBe(0);
    expect(report.updatedCredentials).toBe(0);
    expect(updatesFor('users')).toEqual([]);
  });

  it('respeita o ajuste manual da gerente em credentials e não rebaixa para teacher', async () => {
    setup(
      [{ id: 'm1', data: { isTeacher: true } }],
      [{ id: 'm1', data: { role: ROLES.MANAGER } }],
    );

    const report = await service.migrateRoles();

    expect(updatesFor('users')).toEqual([
      { id: 'm1', data: { role: ROLES.MANAGER } },
    ]);
    expect(report.updatedCredentials).toBe(0);
  });

  it('propaga o papel de users para a credencial fora de sincronia', async () => {
    setup(
      [{ id: 'm1', data: { role: ROLES.MANAGER, isTeacher: true } }],
      [{ id: 'm1', data: { role: ROLES.TEACHER } }],
    );

    await service.migrateRoles();

    expect(updatesFor('credentials')).toEqual([
      { id: 'm1', data: { role: ROLES.MANAGER } },
    ]);
  });

  describe('migração dos slots de agenda', () => {
    const legacySlot = {
      id: '2_15',
      data: { dayOfWeek: 2, hour: 15, occupantType: 'student', studentId: 's1' },
    };

    it('reescreve o docId dos slots antigos com a gerente como dona', async () => {
      setup(
        [{ id: 'm1', data: { fullName: 'Bárbara', role: ROLES.MANAGER } }],
        [{ id: 'm1', data: { role: ROLES.MANAGER } }],
        [legacySlot],
      );

      const report = await service.migrateRoles();

      expect(report.agendaSlotsMigrated).toBe(1);
      expect(repository.moveAll).toHaveBeenCalledWith('agenda', [
        {
          fromId: '2_15',
          toId: 'm1_2_15',
          data: expect.objectContaining({
            teacherId: 'm1',
            teacherName: 'Bárbara',
            dayOfWeek: 2,
            hour: 15,
          }),
        },
      ]);
    });

    it('não toca em slots que já têm professora', async () => {
      setup(
        [{ id: 'm1', data: { fullName: 'Bárbara', role: ROLES.MANAGER } }],
        [{ id: 'm1', data: { role: ROLES.MANAGER } }],
        [{ id: 'm1_2_15', data: { ...legacySlot.data, teacherId: 'm1' } }],
      );

      const report = await service.migrateRoles();

      expect(report.agendaSlotsMigrated).toBe(0);
      expect(repository.moveAll).not.toHaveBeenCalled();
    });

    it('não adivinha a dona quando não há exatamente uma gerente', async () => {
      setup(
        [{ id: 't1', data: { isTeacher: true } }],
        [{ id: 't1', data: { role: ROLES.TEACHER } }],
        [legacySlot],
      );

      const report = await service.migrateRoles();

      expect(report.agendaSlotsMigrated).toBe(0);
      expect(report.agendaSlotsSkipped).toBe(1);
      expect(repository.moveAll).not.toHaveBeenCalled();
    });
  });

  it('reporta usuários sem credencial em vez de falhar', async () => {
    setup([{ id: 'u1', data: { isTeacher: false } }], []);

    const report = await service.migrateRoles();

    expect(report.missingCredentials).toEqual(['u1']);
    expect(report.updatedCredentials).toBe(0);
  });
});
