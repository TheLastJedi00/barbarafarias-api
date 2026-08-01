import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { AgendaRepository } from './agenda.repository';
import { TurmaRepository } from '../turmas/turma.repository';
import { AgendaSlot, StudentSchedule } from './agenda.entity';
import { AssignSlotDto } from './dto/assign-slot.dto';
import { ROLES } from '../types/role';
import {
  DEFAULT_SLOT_COUNT,
  LAST_HOUR,
  formatSlotHour,
  slotsOf,
} from '../common/slot-time';
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

  /**
   * Aloca um bloco de aula. A aula padrão de 1 hora materializa DOIS
   * documentos de 30 min consecutivos (spec 011 RF5): a grade mostra as duas
   * metades tomadas e qualquer tentativa de encaixar alguém no meio esbarra na
   * verificação de colisão abaixo.
   */
  async assign(dto: AssignSlotDto): Promise<void> {
    if (!dto.teacherId) {
      throw new BadRequestException('teacherId é obrigatório');
    }

    const slotCount = dto.slotCount ?? DEFAULT_SLOT_COUNT;
    const hours = slotsOf(dto.hour, slotCount);

    const last = hours[hours.length - 1];
    if (last > LAST_HOUR) {
      throw new BadRequestException(
        `A aula ultrapassa o fim do expediente (${formatSlotHour(LAST_HOUR)})`,
      );
    }

    await this.assertFree(dto.teacherId, dto.dayOfWeek, hours);

    const slots = hours.map(
      (hour) =>
        new AgendaSlot(dto.teacherId!, dto.dayOfWeek, hour, dto.occupantType, {
          teacherName: dto.teacherName,
          studentId: dto.studentId,
          studentName: dto.studentName,
          turmaId: dto.turmaId,
          turmaName: dto.turmaName,
          startHour: dto.hour,
          slotCount,
        }),
    );
    await this.agendaRepository.upsertMany(slots);
  }

  /**
   * Recusa a alocação se qualquer meia-hora do bloco já estiver tomada —
   * inclusive por um bloco que começou meia hora antes e se estende sobre ela.
   * Realocar o MESMO ocupante no mesmo bloco é permitido (é uma edição).
   */
  private async assertFree(
    teacherId: string,
    dayOfWeek: number,
    hours: number[],
  ): Promise<void> {
    const blocks = await Promise.all(
      hours.map((hour) =>
        this.agendaRepository.findCovering(teacherId, dayOfWeek, hour),
      ),
    );

    const startHour = hours[0];
    for (const [index, covering] of blocks.entries()) {
      const conflict = covering.find((slot) => slot.startHour !== startHour);
      if (conflict) {
        throw new ConflictException(
          `Horário ${formatSlotHour(hours[index])} já ocupado por ${
            conflict.studentName ?? conflict.turmaName ?? 'outra aula'
          }`,
        );
      }
    }
  }

  /**
   * Libera o bloco inteiro a partir de qualquer uma das suas metades: clicar
   * em "liberar" nas 08:30 de uma aula que começa às 08:00 apaga as duas.
   */
  async free(
    teacherId: string,
    dayOfWeek: number,
    hour: number,
  ): Promise<void> {
    const covering = await this.agendaRepository.findCovering(
      teacherId,
      dayOfWeek,
      hour,
    );
    const hours = covering.flatMap((slot) => slot.coveredHours());
    await this.agendaRepository.removeMany(
      teacherId,
      dayOfWeek,
      hours.length > 0 ? [...new Set(hours)] : [hour],
    );
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
