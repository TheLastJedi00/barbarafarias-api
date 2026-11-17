import {
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { StoreSupplyService } from './store-supply.service';
import type { StorePurchase } from './store-purchase.model';
import type { StoreSupply, StoreSupplyContent } from './store-supply.model';
import { User } from '../users/user.entity';

const H = 60 * 60 * 1000;
const NOW = new Date('2026-11-17T10:00:00.000Z');

const purchase: StorePurchase = {
  id: 'c1',
  userId: 'u1',
  productId: 'p1',
  kind: 'module',
  level: 'A1',
  moduleId: 'm1',
  titleSnapshot: 'Trabalho',
  priceSnapshot: 97,
  installments: 1,
  method: 'PIX',
  status: 'PAID',
  gateway: {},
  termsVersion: 'v1',
  paidAt: '2026-11-17T09:00:00.000Z',
  accessUntil: '2027-02-15T09:00:00.000Z',
  createdAt: '2026-11-17T09:00:00.000Z',
  updatedAt: '2026-11-17T09:00:00.000Z',
};

const careerProfile = {
  workArea: 'saude',
  careerStage: 'pleno',
  englishContact: 'nenhum',
  answeredAt: '2026-11-17T09:30:00.000Z',
};

const topic = (title: string) => ({
  topic: title,
  description: 'd',
  examples: ['e'],
  curiosity: 'c',
  roleplayInstruction: 'r',
  roleplayDialog: ['a'],
  words: [{ english: 'w', portuguese: 'p', pronounce: 'x' }],
  music: { title: 't', artist: 'a', youtube: 'y' },
});

/** Repositório em memória, com a mesma semântica de `transact`. */
function memoryRepo() {
  const headers = new Map<string, StoreSupply>();
  const contents = new Map<string, StoreSupplyContent>();
  const key = (id: string, n: number) => `${id}_${n}`;
  return {
    headers,
    contents,
    findById: jest.fn(async (id: string) =>
      headers.has(id) ? structuredClone(headers.get(id)!) : null,
    ),
    transact: jest.fn(
      async (id: string, fn: (c: StoreSupply | null) => any) => {
        const current = headers.has(id)
          ? structuredClone(headers.get(id)!)
          : null;
        const { write, result } = fn(current);
        if (write) headers.set(id, structuredClone(write));
        return result;
      },
    ),
    findContent: jest.fn(async (id: string, n: number) =>
      contents.has(key(id, n))
        ? structuredClone(contents.get(key(id, n))!)
        : null,
    ),
    saveStepContent: jest.fn(
      async (id: string, n: number, step: string, content: any) => {
        const doc = contents.get(key(id, n)) ?? {
          supplyId: id,
          generation: n,
          steps: {},
        };
        doc.steps[step] = content;
        contents.set(key(id, n), doc);
      },
    ),
    finish: jest.fn(
      async (
        header: StoreSupply,
        n: number,
        module: any,
        previous?: number,
      ) => {
        contents.get(key(header.id, n))!.module = module;
        headers.set(header.id, structuredClone(header));
        if (previous !== undefined && previous !== n) {
          contents.delete(key(header.id, previous));
        }
      },
    ),
    deleteContent: jest.fn(async (id: string, n: number) => {
      contents.delete(key(id, n));
    }),
  };
}

function setup(
  opts: { purchase?: Partial<StorePurchase>; user?: Partial<User> } = {},
) {
  const repo = memoryRepo();
  const purchases = {
    findById: jest.fn(async (id: string) =>
      id === 'c1' ? { ...purchase, ...opts.purchase } : null,
    ),
  };
  const users = {
    findById: jest.fn(
      async () =>
        new User({
          id: 'u1',
          fullName: 'Bruno Lima',
          careerProfile,
          ...opts.user,
        }),
    ),
  };
  const curriculum = {
    getPrincipal: jest.fn().mockResolvedValue({ prompt: 'Persona' }),
    getLevel: jest.fn().mockResolvedValue({ level: 'A1', prompt: 'A1' }),
    toBlueprint: jest.fn().mockReturnValue({
      level: 'A1',
      modules: [
        {
          id: 'm1',
          title: 'Trabalho',
          context: '',
          topics: [
            { id: 't1', title: 'Reuniões' },
            { id: 't2', title: 'E-mails' },
          ],
        },
      ],
    }),
  };
  const gemini = {
    generateJson: jest.fn(async (prompt: string) =>
      prompt.includes('INTRODUÇÕES DOS MÓDULOS')
        ? ['Intro do Bruno']
        : topic(prompt.includes('"Reuniões"') ? 'Reuniões' : 'E-mails'),
    ),
  };
  let now = NOW;
  const service = new StoreSupplyService(
    repo as any,
    purchases as any,
    users as any,
    curriculum as any,
    gemini as any,
    () => now,
  );
  return {
    service,
    repo,
    gemini,
    curriculum,
    users,
    advance: (ms: number) => (now = new Date(now.getTime() + ms)),
  };
}

describe('StoreSupplyService (spec 033)', () => {
  describe('start', () => {
    it('abre a geração com a intro e os tópicos do módulo comprado', async () => {
      const { service, repo } = setup();

      const view = await service.start('u1', 'c1');

      expect(view.pending).toEqual({
        number: 1,
        stuck: false,
        steps: [
          { id: 'intro', title: 'Introdução', status: 'pending', attempts: 0 },
          { id: 't1', title: 'Reuniões', status: 'pending', attempts: 0 },
          { id: 't2', title: 'E-mails', status: 'pending', attempts: 0 },
        ],
      });
      expect(view.chances).toEqual({
        used: 1,
        max: 3,
        canGenerate: false,
        nextAvailableAt: new Date(NOW.getTime() + 6 * H).toISOString(),
      });
      const header = repo.headers.get('u1_p1')!;
      expect(header.pending!.careerProfile).toEqual(careerProfile);
      expect(header.chances).toEqual({
        purchaseId: 'c1',
        used: 1,
        lastStartedAt: NOW.toISOString(),
      });
    });

    it('chamar de novo retoma a mesma geração, sem gastar chance', async () => {
      const { service, repo } = setup();
      await service.start('u1', 'c1');

      const view = await service.start('u1', 'c1');

      expect(view.pending!.number).toBe(1);
      expect(repo.headers.get('u1_p1')!.chances.used).toBe(1);
    });

    it('sem o questionário respondido, 409', async () => {
      const { service } = setup({ user: { careerProfile: undefined } });
      await expect(service.start('u1', 'c1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('compra vencida, 403; compra de outra pessoa, 404', async () => {
      await expect(
        setup({
          purchase: { accessUntil: '2026-11-01T00:00:00.000Z' },
        }).service.start('u1', 'c1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        setup({ purchase: { userId: 'outro' } }).service.start('u1', 'c1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('módulo que saiu do currículo, 422', async () => {
      const { service, curriculum } = setup();
      curriculum.toBlueprint.mockReturnValue({ level: 'A1', modules: [] });
      await expect(service.start('u1', 'c1')).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });
  });
});
