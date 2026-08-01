import { ForbiddenException } from '@nestjs/common';
import { AgendaService } from './agenda.service';
import { AgendaSlot } from './agenda.entity';
import { ROLES } from '../types/role';

describe('AgendaService', () => {
  let service: AgendaService;
  let agendaRepository: {
    findAll: jest.Mock;
    findByStudentId: jest.Mock;
    findByTurmaIds: jest.Mock;
    findCovering: jest.Mock;
    upsert: jest.Mock;
    upsertMany: jest.Mock;
    remove: jest.Mock;
    removeMany: jest.Mock;
  };
  let turmaRepository: { findAll: jest.Mock };

  beforeEach(() => {
    agendaRepository = {
      findAll: jest.fn().mockResolvedValue([]),
      findByStudentId: jest.fn().mockResolvedValue([]),
      findByTurmaIds: jest.fn().mockResolvedValue([]),
      findCovering: jest.fn().mockResolvedValue([]),
      upsert: jest.fn().mockResolvedValue(undefined),
      upsertMany: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockResolvedValue(undefined),
      removeMany: jest.fn().mockResolvedValue(undefined),
    };
    turmaRepository = { findAll: jest.fn().mockResolvedValue([]) };
    service = new AgendaService(
      agendaRepository as any,
      turmaRepository as any,
    );
  });

  const manager = { sub: 'm1', email: 'g@x.com', role: ROLES.MANAGER } as any;
  const teacher = { sub: 't1', email: 't@x.com', role: ROLES.TEACHER } as any;

  describe('resolveScope', () => {
    it('a gerente vê todas as grades quando não filtra', () => {
      expect(service.resolveScope(manager)).toBeUndefined();
    });

    it('a gerente pode filtrar pela grade de uma professora', () => {
      expect(service.resolveScope(manager, 't1')).toBe('t1');
    });

    it('a professora fica presa à própria grade', () => {
      expect(service.resolveScope(teacher)).toBe('t1');
      expect(service.resolveScope(teacher, 't1')).toBe('t1');
    });

    it('a professora não acessa a grade de outra', () => {
      expect(() => service.resolveScope(teacher, 't2')).toThrow(
        ForbiddenException,
      );
    });
  });

  describe('getGrid', () => {
    it('consulta apenas os slots da professora quando há escopo', async () => {
      await service.getGrid('t1');
      expect(agendaRepository.findAll).toHaveBeenCalledWith('t1');
    });

    it('esconde slots de turmas excluídas', async () => {
      agendaRepository.findAll.mockResolvedValueOnce([
        new AgendaSlot('t1', 1, 9, 'turma', { turmaId: 'viva' }),
        new AgendaSlot('t1', 2, 9, 'turma', { turmaId: 'excluida' }),
      ]);
      turmaRepository.findAll.mockResolvedValueOnce([{ id: 'viva' }]);

      const grid = await service.getGrid('t1');

      expect(grid).toHaveLength(1);
      expect(grid[0].turmaId).toBe('viva');
    });
  });

  describe('assign', () => {
    it('grava o slot com a professora dona', async () => {
      await service.assign({
        teacherId: 't1',
        teacherName: 'Ana',
        dayOfWeek: 3,
        hour: 10,
        occupantType: 'student',
        studentId: 's1',
        studentName: 'Léo',
      } as any);

      // aula padrão de 1 hora → dois documentos de 30 min (spec 011 RF5)
      expect(agendaRepository.upsertMany).toHaveBeenCalledWith([
        expect.objectContaining({
          teacherId: 't1',
          teacherName: 'Ana',
          dayOfWeek: 3,
          hour: 10,
          startHour: 10,
          slotCount: 2,
          studentId: 's1',
        }),
        expect.objectContaining({
          teacherId: 't1',
          dayOfWeek: 3,
          hour: 10.5,
          startHour: 10,
          slotCount: 2,
          studentId: 's1',
        }),
      ]);
    });

    it('permite alocacao quando o resolveScope fornece o teacherId de fallback', async () => {
      const resolvedTeacherId = service.resolveScope(teacher, undefined) ?? teacher.sub;
      expect(resolvedTeacherId).toBe('t1');

      await service.assign({
        teacherId: resolvedTeacherId,
        dayOfWeek: 1,
        hour: 9,
        occupantType: 'student',
        studentId: 's2',
        studentName: 'Maria',
      } as any);

      expect(agendaRepository.upsertMany).toHaveBeenCalledWith([
        expect.objectContaining({
          teacherId: 't1',
          dayOfWeek: 1,
          hour: 9,
          studentId: 's2',
        }),
        expect.objectContaining({ hour: 9.5, startHour: 9 }),
      ]);
    });
  });

  describe('getStudentSchedule', () => {
    it('devolve a professora responsável junto do horário', async () => {
      agendaRepository.findByStudentId.mockResolvedValueOnce([
        new AgendaSlot('t1', 4, 14, 'student', {
          teacherName: 'Ana',
          studentId: 's1',
        }),
      ]);

      const schedule = await service.getStudentSchedule('s1');

      expect(schedule).toEqual([
        {
          dayOfWeek: 4,
          hour: 14,
          kind: 'individual',
          teacherId: 't1',
          teacherName: 'Ana',
          slotCount: 2,
        },
      ]);
    });
  });
});
