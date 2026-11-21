import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  TurmaLifecycleController,
  TurmaRemindersCronController,
} from './turma-lifecycle.controller';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ROLES } from '../types/role';

/** Rotas do ciclo da turma e o cron dos lembretes (spec 036 T19, T21, T23). */
describe('ciclo da turma — rotas (spec 036)', () => {
  it('confirmar, adiar, cancelar e ver matrículas são só da gerente', () => {
    const rolesOf = (method: keyof TurmaLifecycleController): unknown =>
      Reflect.getMetadata(
        ROLES_KEY,
        TurmaLifecycleController.prototype[method],
      );
    for (const method of [
      'confirm',
      'postpone',
      'cancel',
      'enrollments',
      'overview',
    ] as const) {
      expect(rolesOf(method)).toEqual([ROLES.MANAGER]);
    }
  });

  describe('cron dos lembretes', () => {
    const build = (secret?: string) => {
      const service = { sendStartReminders: jest.fn(async () => ['t1']) };
      const config = { get: jest.fn(() => secret) };
      return {
        service,
        controller: new TurmaRemindersCronController(
          service as any,
          config as any,
        ),
      };
    };

    it('é pública (a Vercel não tem token) e protegida pelo CRON_SECRET', async () => {
      expect(
        Reflect.getMetadata(
          IS_PUBLIC_KEY,
          TurmaRemindersCronController.prototype.run,
        ),
      ).toBe(true);
      const { controller, service } = build('s3gr3do');
      await expect(controller.run('Bearer s3gr3do')).resolves.toEqual({
        reminded: ['t1'],
      });
      expect(service.sendStartReminders).toHaveBeenCalled();
    });

    it('segredo errado é 401; sem segredo configurado é 503', async () => {
      await expect(
        build('s3gr3do').controller.run('Bearer x'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(build().controller.run('Bearer x')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });
  });
});
