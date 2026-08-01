import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { AgendaRepository } from './agenda.repository';
import { TurmaRepository } from '../turmas/turma.repository';
import { AgendaSlot, StudentSchedule } from './agenda.entity';
import { AssignSlotDto } from './dto/assign-slot.dto';
import { ROLES } from '../types/role';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';

@Injectable()
export class AgendaService {
  constructor(
    private readonly agendaRepository: AgendaRepository,
    private readonly turmaRepository: TurmaRepository,
  ) {}

  /**
   * Resolve de qual professora é a grade que a requisição pode tocar.
   * A gerente escolhe (ou vê todas); a professora fica presa à própria.
   */
  resolveScope(user: AuthenticatedUser, requestedTeacherId?: string): string | undefined {
    if (user.role === ROLES.MANAGER) {
      return requestedTeacherId;
    }
    if (requestedTeacherId && requestedTeacherId !== user.sub) {
      throw new ForbiddenException('Sem acesso à agenda de outra professora');
    }
    return user.sub;
  }

  async getGrid(teacherId?: string): Promise<AgendaSlot[]> {
    const [slots, turmas] = await Promise.all([
      this.agendaRepository.findAll(teacherId),
      this.turmaRepository.findAll(),
    ]);
    const validTurmaIds = new Set(turmas.map((t) => t.id));
    // RF8: slots que apontam para turmas excluídas são tratados como livres
    // (ocultados da grade) — sem cascade nem acoplamento circular entre módulos.
    return slots.filter(
      (s) => s.occupantType !== 'turma' || validTurmaIds.has(s.turmaId),
    );
  }

  async assign(dto: AssignSlotDto): Promise<void> {
    if (!dto.teacherId) {
      throw new BadRequestException('teacherId é obrigatório');
    }
    const slot = new AgendaSlot(
      dto.teacherId,
      dto.dayOfWeek,
      dto.hour,
      dto.occupantType,
      {
        teacherName: dto.teacherName,
        studentId: dto.studentId,
        studentName: dto.studentName,
        turmaId: dto.turmaId,
        turmaName: dto.turmaName,
      },
    );
    await this.agendaRepository.upsert(slot);
  }

  free(teacherId: string, dayOfWeek: number, hour: number): Promise<void> {
    return this.agendaRepository.remove(teacherId, dayOfWeek, hour);
  }

  /** Turmas às quais o aluno pertence. */
  async getStudentTurmaIds(studentId: string): Promise<string[]> {
    const turmas = await this.turmaRepository.findAll();
    return turmas
      .filter((turma) => turma.studentIds.includes(studentId))
      .map((turma) => turma.id)
      .filter((id): id is string => !!id);
  }

  /**
   * Horário resolvido do aluno: alocações diretas (individual) +
   * slots das turmas às quais ele pertence.
   */
  async getStudentSchedule(studentId: string): Promise<StudentSchedule[]> {
    const direct = await this.agendaRepository.findByStudentId(studentId);

    const turmaIds = await this.getStudentTurmaIds(studentId);
    const turmaSlots = await this.agendaRepository.findByTurmaIds(turmaIds);

    // Um bloco de 1 hora tem dois documentos; o aluno vê UMA aula, então só o
    // slot inicial vira card — a duração vai em `slotCount` (spec 011 RF5).
    const individual: StudentSchedule[] = direct
      .filter((s) => s.isBlockStart())
      .map((s) => ({
        dayOfWeek: s.dayOfWeek,
        hour: s.hour,
        kind: 'individual',
        teacherId: s.teacherId,
        teacherName: s.teacherName,
        slotCount: s.slotCount,
      }));
    const group: StudentSchedule[] = turmaSlots
      .filter((s) => s.isBlockStart())
      .map((s) => ({
        dayOfWeek: s.dayOfWeek,
        hour: s.hour,
        kind: 'turma',
        turmaName: s.turmaName,
        teacherId: s.teacherId,
        teacherName: s.teacherName,
        slotCount: s.slotCount,
      }));

    return [...individual, ...group].sort(
      (a, b) => a.dayOfWeek - b.dayOfWeek || a.hour - b.hour,
    );
  }
}
