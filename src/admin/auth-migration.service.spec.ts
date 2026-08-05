import { ConflictException } from '@nestjs/common';
import { AuthMigrationService, CLEANUP_CONFIRMATION } from './auth-migration.service';
import { ROLES } from '../types/role';

describe('AuthMigrationService', () => {
  let repository: { findAll: jest.Mock; deleteAll: jest.Mock };
  let auth: {
    getUser: jest.Mock;
    createUser: jest.Mock;
    setCustomUserClaims: jest.Mock;
  };
  let service: AuthMigrationService;
  /** uids que já têm conta no Firebase. */
  let existentes: Set<string>;

  function notFound() {
    return Object.assign(new Error('not found'), { code: 'auth/user-not-found' });
  }

  function setup(users: any[], credentials: any[] = []) {
    existentes = new Set();
    repository = {
      findAll: jest.fn((collection: string) =>
        Promise.resolve(collection === 'users' ? users : credentials),
      ),
      deleteAll: jest.fn().mockResolvedValue(undefined),
    };
    auth = {
      getUser: jest.fn(async (uid: string) => {
        if (!existentes.has(uid)) throw notFound();
        return { uid };
      }),
      createUser: jest.fn(async ({ uid }: { uid: string }) => {
        existentes.add(uid);
        return { uid };
      }),
      setCustomUserClaims: jest.fn().mockResolvedValue(undefined),
    };
    service = new AuthMigrationService(repository as any, auth as any);
  }

  describe('migrateAuth', () => {
    it('cria a conta com o mesmo uid do documento e o papel na claim', async () => {
      // O uid precisa ser o id do documento: é ele que vira `sub` no token e
      // continua sendo a chave de `users/{id}` em toda rota do sistema.
      setup([{ id: 'u1', data: { email: 'a@b.com', role: ROLES.TEACHER } }]);

      const report = await service.migrateAuth();

      expect(auth.createUser).toHaveBeenCalledWith({
        uid: 'u1',
        email: 'a@b.com',
        password: expect.any(String),
      });
      expect(auth.setCustomUserClaims).toHaveBeenCalledWith('u1', {
        role: ROLES.TEACHER,
      });
      expect(report).toMatchObject({ criados: 1, jaExistentes: 0 });
    });

    it('nunca reusa a mesma senha entre duas contas', async () => {
      setup([
        { id: 'u1', data: { email: 'a@b.com' } },
        { id: 'u2', data: { email: 'c@d.com' } },
      ]);

      await service.migrateAuth();

      const [primeira, segunda] = auth.createUser.mock.calls.map(
        ([arg]) => arg.password,
      );
      expect(primeira).not.toBe(segunda);
    });

    it('pega o e-mail da coleção legada quando o documento não tem', async () => {
      setup(
        [{ id: 'u1', data: { isTeacher: true } }],
        [{ id: 'u1', data: { email: 'legado@b.com', role: ROLES.MANAGER } }],
      );

      await service.migrateAuth();

      expect(auth.createUser).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'legado@b.com' }),
      );
      // credentials.role continua tendo precedência sobre o isTeacher legado
      expect(auth.setCustomUserClaims).toHaveBeenCalledWith('u1', {
        role: ROLES.MANAGER,
      });
    });

    it('é idempotente: a segunda execução não cria nada', async () => {
      setup([{ id: 'u1', data: { email: 'a@b.com' } }]);

      await service.migrateAuth();
      auth.createUser.mockClear();
      const segunda = await service.migrateAuth();

      expect(auth.createUser).not.toHaveBeenCalled();
      expect(segunda).toMatchObject({ criados: 0, jaExistentes: 1 });
    });

    it('reporta documento sem e-mail em vez de falhar', async () => {
      setup([{ id: 'u1', data: {} }]);

      const report = await service.migrateAuth();

      expect(report.semEmail).toEqual(['u1']);
      expect(auth.createUser).not.toHaveBeenCalled();
    });

    it('reporta e-mail já usado por outra conta, sem escolher sozinho', async () => {
      // Duas fichas com o mesmo e-mail: escolher automaticamente arriscaria
      // dar a conta de uma pessoa para outra.
      setup([{ id: 'u1', data: { email: 'a@b.com' } }]);
      auth.createUser.mockRejectedValue({ code: 'auth/email-already-exists' });

      const report = await service.migrateAuth();

      expect(report.emailDuplicado).toEqual([{ uid: 'u1', email: 'a@b.com' }]);
      expect(report.erros).toEqual([]);
    });

    it('um erro isolado não interrompe a migração dos demais', async () => {
      setup([
        { id: 'u1', data: { email: 'a@b.com' } },
        { id: 'u2', data: { email: 'c@d.com' } },
      ]);
      auth.createUser.mockRejectedValueOnce({ message: 'rede fora' });

      const report = await service.migrateAuth();

      expect(report.erros).toEqual([{ uid: 'u1', motivo: 'rede fora' }]);
      expect(report.criados).toBe(1);
    });
  });

  describe('cleanupCredentials', () => {
    it('sem confirmação, apenas relata', async () => {
      setup([], [{ id: 'u1', data: {} }]);
      existentes.add('u1');

      const report = await service.cleanupCredentials();

      expect(report).toMatchObject({ total: 1, comConta: 1, apagados: 0 });
      expect(repository.deleteAll).not.toHaveBeenCalled();
    });

    it('apaga quando confirmado e todos têm conta', async () => {
      setup([], [{ id: 'u1', data: {} }, { id: 'u2', data: {} }]);
      existentes.add('u1');
      existentes.add('u2');

      const report = await service.cleanupCredentials(CLEANUP_CONFIRMATION);

      expect(repository.deleteAll).toHaveBeenCalledWith('credentials', ['u1', 'u2']);
      expect(report.apagados).toBe(2);
    });

    it('recusa a limpeza quando alguém ainda não migrou', async () => {
      // Apagar aqui destruiria a única pista de qual e-mail pertencia a qual
      // uid — exatamente o que seria preciso para consertar a migração.
      setup([], [{ id: 'u1', data: {} }]);

      await expect(
        service.cleanupCredentials(CLEANUP_CONFIRMATION),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(repository.deleteAll).not.toHaveBeenCalled();
    });
  });
});
