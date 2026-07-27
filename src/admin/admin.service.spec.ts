import { AdminService } from './admin.service';
import { ROLES } from '../types/role';

describe('AdminService.migrateRoles', () => {
  let service: AdminService;
  let repository: { findAll: jest.Mock; mergeAll: jest.Mock };

  function setup(users: any[], credentials: any[]) {
    repository = {
      findAll: jest.fn((collection: string) =>
        Promise.resolve(collection === 'users' ? users : credentials),
      ),
      mergeAll: jest.fn().mockResolvedValue(undefined),
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

  it('reporta usuários sem credencial em vez de falhar', async () => {
    setup([{ id: 'u1', data: { isTeacher: false } }], []);

    const report = await service.migrateRoles();

    expect(report.missingCredentials).toEqual(['u1']);
    expect(report.updatedCredentials).toBe(0);
  });
});
