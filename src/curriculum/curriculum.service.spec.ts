import { CurriculumService } from './curriculum.service';

describe('CurriculumService', () => {
  let service: CurriculumService;
  let repository: {
    getPrincipal: jest.Mock;
    upsertPrincipal: jest.Mock;
    getLevel: jest.Mock;
    upsertLevel: jest.Mock;
  };

  beforeEach(() => {
    repository = {
      getPrincipal: jest.fn(),
      upsertPrincipal: jest.fn().mockResolvedValue(undefined),
      getLevel: jest.fn(),
      upsertLevel: jest.fn().mockResolvedValue(undefined),
    };
    service = new CurriculumService(repository as any);
  });

  describe('getPrincipal', () => {
    it('retorna prompt vazio quando nada foi salvo', async () => {
      repository.getPrincipal.mockResolvedValue(null);
      expect(await service.getPrincipal()).toEqual({ prompt: '' });
    });
  });

  describe('getLevel', () => {
    it('retorna estrutura vazia padrão quando o nível não existe', async () => {
      repository.getLevel.mockResolvedValue(null);
      expect(await service.getLevel('A1')).toEqual({
        level: 'A1',
        prompt: '',
        modules: [],
      });
    });

    it('normaliza a ordem pela posição do array ao ler', async () => {
      repository.getLevel.mockResolvedValue({
        level: 'A1',
        prompt: 'p',
        modules: [
          {
            id: 'm2',
            title: 'B',
            context: '',
            order: 5,
            topics: [{ id: 't2', title: 'x', order: 9 }],
          },
          {
            id: 'm1',
            title: 'A',
            context: '',
            order: 1,
            topics: [{ id: 't1', title: 'y', order: 3 }],
          },
        ],
      });

      const result = await service.getLevel('A1');
      // ordenado por order asc, reindexado 0..n
      expect(result.modules.map((m) => m.id)).toEqual(['m1', 'm2']);
      expect(result.modules.map((m) => m.order)).toEqual([0, 1]);
      expect(result.modules[0].topics[0].order).toBe(0);
    });
  });

  describe('upsertLevel', () => {
    it('deriva order da posição e gera id quando ausente', async () => {
      const result = await service.upsertLevel('B1', {
        prompt: 'nivel B1',
        modules: [
          {
            title: 'Mod 1',
            context: 'ctx',
            topics: [{ title: 'topico 1' }, { id: 'fixo', title: 'topico 2' }],
          },
        ],
      });

      const mod = result.modules[0];
      expect(mod.order).toBe(0);
      expect(mod.id).toBeDefined();
      expect(mod.topics[0].order).toBe(0);
      expect(mod.topics[1].order).toBe(1);
      // id fornecido é preservado
      expect(mod.topics[1].id).toBe('fixo');
      expect(repository.upsertLevel).toHaveBeenCalledTimes(1);
    });
  });

  describe('getBlueprint', () => {
    it('projeta módulos/tópicos ordenados sem campos de controle (order)', async () => {
      repository.getLevel.mockResolvedValue({
        level: 'A2',
        prompt: 'p',
        modules: [
          {
            id: 'm1',
            title: 'Rotina',
            context: 'ctx',
            order: 0,
            topics: [
              { id: 't2', title: 'segundo', order: 1 },
              { id: 't1', title: 'primeiro', order: 0 },
            ],
          },
        ],
      });

      const blueprint = await service.getBlueprint('A2');
      expect(blueprint.level).toBe('A2');
      expect(blueprint.modules[0]).toEqual({
        id: 'm1',
        title: 'Rotina',
        context: 'ctx',
        topics: [
          { id: 't1', title: 'primeiro' },
          { id: 't2', title: 'segundo' },
        ],
      });
    });
  });
});
