import { AdminService } from './admin.service';
import { ROLES } from '../types/role';

describe('AdminService.migrateRoles', () => {
  let service: AdminService;
  let repository: {
    findAll: jest.Mock;
    mergeAll: jest.Mock;
    moveAll: jest.Mock;
  };
  let auth: { getUser: jest.Mock; setCustomUserClaims: jest.Mock };

  /**
   * Contas do Firebase por uid. `undefined` = conta ausente, que é o caso de
   * quem ainda não passou pela migração da Task 83.
   */
  let contas: Record<string, { customClaims?: Record<string, any> } | undefined>;

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
    contas = Object.fromEntries(users.map((u) => [u.id, { customClaims: {} }]));
    auth = {
      getUser: jest.fn(async (uid: string) => {
        const conta = contas[uid];
        if (!conta) {
          throw Object.assign(new Error('not found'), {
            code: 'auth/user-not-found',
          });
        }
        return conta;
      }),
      setCustomUserClaims: jest.fn().mockResolvedValue(undefined),
    };
    service = new AdminService(repository as any, auth as any);
  }

  function updatesFor(collection: string) {
    const call = repository.mergeAll.mock.calls.find(
      ([name]) => name === collection,
    );
    return call ? call[1] : [];
  }

  it('migra isTeacher para role em users e grava a claim de cada conta', async () => {
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
      updatedClaims: 2,
      missingAccounts: [],
    });
    expect(updatesFor('users')).toEqual([
      { id: 'u1', data: { role: ROLES.TEACHER } },
      { id: 'u2', data: { role: ROLES.STUDENT } },
    ]);
    expect(auth.setCustomUserClaims).toHaveBeenCalledWith('u1', {
      role: ROLES.TEACHER,
    });
    expect(auth.setCustomUserClaims).toHaveBeenCalledWith('u2', {
      role: ROLES.STUDENT,
    });
  });

  it('não escreve mais na coleção legada de credenciais', async () => {
    // A partir da spec 016 quem manda no token é a Custom Claim; continuar
    // gravando em `credentials` daria duas fontes de papel outra vez.
    setup(
      [{ id: 'u1', data: { isTeacher: true } }],
      [{ id: 'u1', data: { role: undefined } }],
    );

    await service.migrateRoles();

    expect(updatesFor('credentials')).toEqual([]);
  });

  it('é idempotente: nada a fazer quando tudo já está sincronizado', async () => {
    setup(
      [{ id: 'u1', data: { isTeacher: true, role: ROLES.TEACHER } }],
      [{ id: 'u1', data: { role: ROLES.TEACHER } }],
    );
    contas['u1'] = { customClaims: { role: ROLES.TEACHER } };

    const report = await service.migrateRoles();

    expect(report.updatedUsers).toBe(0);
    expect(report.updatedClaims).toBe(0);
    expect(updatesFor('users')).toEqual([]);
    expect(auth.setCustomUserClaims).not.toHaveBeenCalled();
  });

  it('respeita o ajuste manual da gerente em credentials e não rebaixa para teacher', async () => {
    setup(
      [{ id: 'm1', data: { isTeacher: true } }],
      [{ id: 'm1', data: { role: ROLES.MANAGER } }],
    );

    await service.migrateRoles();

    expect(updatesFor('users')).toEqual([
      { id: 'm1', data: { role: ROLES.MANAGER } },
    ]);
    expect(auth.setCustomUserClaims).toHaveBeenCalledWith('m1', {
      role: ROLES.MANAGER,
    });
  });

  it('corrige a claim fora de sincronia com users', async () => {
    setup(
      [{ id: 'm1', data: { role: ROLES.MANAGER, isTeacher: true } }],
      [{ id: 'm1', data: { role: ROLES.TEACHER } }],
    );
    contas['m1'] = { customClaims: { role: ROLES.TEACHER } };

    const report = await service.migrateRoles();

    expect(auth.setCustomUserClaims).toHaveBeenCalledWith('m1', {
      role: ROLES.MANAGER,
    });
    expect(report.updatedClaims).toBe(1);
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

  it('reporta quem ainda não tem conta no Firebase em vez de falhar', async () => {
    // É o estado esperado antes de `/admin/migrate-auth` rodar: a lista diz
    // exatamente quem ficou de fora, em vez de a migração inteira parar.
    setup([{ id: 'u1', data: { isTeacher: false } }], []);
    contas['u1'] = undefined;

    const report = await service.migrateRoles();

    expect(report.missingAccounts).toEqual(['u1']);
    expect(report.updatedClaims).toBe(0);
  });
});
