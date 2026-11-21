import { BadRequestException, ConflictException } from '@nestjs/common';
import { TurmaFormingService } from './turma-forming.service';
import { Turma, TURMA_STATUS } from './turma.entity';

/**
 * Turma em formação (spec 036 §3–§4): a gerente cria com calendário, start
 * compatível, mínimo e máximo. 2026-12-01 é uma terça.
 */
function build() {
  const store = new Map<string, Turma>();
  let seq = 0;
  const repository = {
    store,
    create: jest.fn(async (data: Omit<Turma, 'id'>) => {
      const turma = new Turma(
        data.name,
        data.studentIds,
        data.studentNames,
        `t${++seq}`,
        data,
      );
      store.set(turma.id!, turma);
      return turma;
    }),
    findById: jest.fn(async (id: string) => store.get(id) ?? null),
    findAll: jest.fn(async () => [...store.values()]),
    save: jest.fn(async (turma: Turma) => {
      store.set(turma.id!, turma);
      return turma;
    }),
  };
  const teachers = {
    findById: jest.fn(async (id: string) => {
      if (id !== 'prof-1') throw new Error('Professora não encontrada');
      return { id, fullName: 'Ana Souza' };
    }),
  };
  const service = new TurmaFormingService(repository as any, teachers as any);
  return { service, repository, teachers };
}

const semanal = (extra: Record<string, unknown> = {}) => ({
  tierId: 'weekly-group' as const,
  teacherId: 'prof-1',
  dayOfWeek: 2,
  hour: 19,
  startDate: '2026-12-01',
  ...extra,
});

const mensal = (extra: Record<string, unknown> = {}) => ({
  tierId: 'monthly-group' as const,
  teacherId: 'prof-1',
  dayOfWeek: 2,
  hour: 19,
  weeksOfMonth: [1, 3],
  founderWeek: 3,
  startDate: '2026-12-15',
  ...extra,
});

describe('TurmaFormingService (spec 036)', () => {
  beforeAll(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    jest.setSystemTime(new Date('2026-11-21T15:00:00.000Z'));
  });
  afterAll(() => jest.useRealTimers());

  describe('criar', () => {
    it('nasce em formação, com mínimo 5 e máximo 8 por padrão e nome legível', async () => {
      const { service } = build();
      const turma = await service.create(semanal());
      expect(turma).toMatchObject({
        status: TURMA_STATUS.FORMING,
        minStudents: 5,
        maxStudents: 8,
        teacherName: 'Ana Souza',
        studentIds: [],
        name: 'Grupo semanal · terça 19:00',
        startHistory: [],
      });
    });

    it('recusa start fora do dia da turma', async () => {
      const { service } = build();
      await expect(
        service.create(semanal({ startDate: '2026-12-02' })),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('recusa start hoje ou no passado', async () => {
      const { service } = build();
      await expect(
        service.create(semanal({ startDate: '2026-11-17' })),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('mensal: exige duas semanas distintas de 1 a 4 e a da fundadora entre elas', async () => {
      const { service } = build();
      await expect(service.create(mensal())).resolves.toMatchObject({
        weeksOfMonth: [1, 3],
        founderWeek: 3,
      });
      for (const ruim of [
        { weeksOfMonth: [1] },
        { weeksOfMonth: [1, 1] },
        { weeksOfMonth: [1, 5] },
        { founderWeek: 2 },
      ]) {
        await expect(service.create(mensal(ruim))).rejects.toBeInstanceOf(
          BadRequestException,
        );
      }
    });

    it('mensal: o start cai numa das semanas escolhidas', async () => {
      const { service } = build();
      await expect(
        service.create(mensal({ startDate: '2026-12-08' })),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('semanal não leva semanas do mês', async () => {
      const { service } = build();
      await expect(
        service.create(semanal({ weeksOfMonth: [1, 3] })),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('aula de 1 hora: começa no máximo às 20:00', async () => {
      const { service } = build();
      await expect(
        service.create(semanal({ hour: 20.5 })),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('máximo não fica abaixo do mínimo', async () => {
      const { service } = build();
      await expect(
        service.create(semanal({ minStudents: 6, maxStudents: 4 })),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('professora inexistente é recusada', async () => {
      const { service } = build();
      await expect(
        service.create(semanal({ teacherId: 'ninguem' })),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('editar', () => {
    it('muda calendário e limites enquanto está em formação, conferindo tudo de novo', async () => {
      const { service } = build();
      const turma = await service.create(semanal());
      const editada = await service.update(turma.id!, {
        dayOfWeek: 4,
        startDate: '2026-12-03',
        maxStudents: 10,
      });
      expect(editada).toMatchObject({
        dayOfWeek: 4,
        startDate: '2026-12-03',
        maxStudents: 10,
      });

      await expect(
        service.update(turma.id!, { dayOfWeek: 5 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('fora de formação não muda calendário', async () => {
      const { service, repository } = build();
      const turma = await service.create(semanal());
      repository.store.get(turma.id!)!.status = TURMA_STATUS.CONFIRMED;
      await expect(
        service.update(turma.id!, { hour: 18 }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
