import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ROLES } from '../types/role';
import { PlanTierController } from './plan-tier.controller';
import { PlanPricesCronController } from './plan-prices-cron.controller';

describe('PlanTierController — papéis', () => {
  const meta = (key: string, method: keyof PlanTierController) =>
    Reflect.getMetadata(key, PlanTierController.prototype[method]);

  it('a vitrine é pública', () => {
    expect(meta(IS_PUBLIC_KEY, 'listPublic')).toBe(true);
  });

  it('listar tudo, editar e desfazer são só da gerente', () => {
    for (const method of ['listAll', 'update', 'cancelPending'] as const) {
      expect(meta(IS_PUBLIC_KEY, method)).toBeUndefined();
      expect(meta(ROLES_KEY, method)).toEqual([ROLES.MANAGER]);
    }
  });
});

describe('PlanTierController — cache da vitrine', () => {
  it('manda o CDN guardar até a próxima mudança possível de preço', async () => {
    const service = { listPublic: jest.fn().mockResolvedValue([]) };
    const controller = new PlanTierController(service as any);
    const setHeader = jest.fn();

    await controller.listPublic({ setHeader } as any);

    expect(setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      expect.stringMatching(
        /^public, s-maxage=\d+, stale-while-revalidate=60$/,
      ),
    );
    const seconds = Number(
      /s-maxage=(\d+)/.exec(setHeader.mock.calls[0][1])![1],
    );
    expect(seconds).toBeGreaterThanOrEqual(1);
    expect(seconds).toBeLessThanOrEqual(3600);
  });
});

describe('PlanPricesCronController', () => {
  function build(secret?: string) {
    const service = {
      applyDuePrices: jest.fn().mockResolvedValue(['private']),
    };
    const config = { get: jest.fn(() => secret) };
    return {
      service,
      controller: new PlanPricesCronController(service as any, config as any),
    };
  }

  it('é pública para a Vercel chamar, e quem protege é o segredo', () => {
    expect(
      Reflect.getMetadata(
        IS_PUBLIC_KEY,
        PlanPricesCronController.prototype.run,
      ),
    ).toBe(true);
  });

  it('sem CRON_SECRET configurado responde 503 e não aplica nada', async () => {
    const { controller, service } = build(undefined);
    await expect(controller.run('Bearer qualquer')).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(service.applyDuePrices).not.toHaveBeenCalled();
  });

  it('segredo errado ou ausente é 401', async () => {
    const { controller, service } = build('s3gr3d0');
    await expect(controller.run('Bearer outro')).rejects.toThrow(
      UnauthorizedException,
    );
    await expect(controller.run(undefined)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(service.applyDuePrices).not.toHaveBeenCalled();
  });

  it('com o segredo certo aplica os preços vencidos', async () => {
    const { controller, service } = build('s3gr3d0');
    await expect(controller.run('Bearer s3gr3d0')).resolves.toEqual({
      applied: ['private'],
    });
    expect(service.applyDuePrices).toHaveBeenCalled();
  });
});
