import { Injectable } from '@nestjs/common';
import { AgendaRepository } from './agenda.repository';
import { TurmaRepository } from '../turmas/turma.repository';
import { AgendaSlot, StudentSchedule } from './agenda.entity';
import { AssignSlotDto } from './dto/assign-slot.dto';

@Injectable()
export class AgendaService {
  constructor(
    private readonly agendaRepository: AgendaRepository,
    private readonly turmaRepository: TurmaRepository,
  ) {}

  getGrid(): Promise<AgendaSlot[]> {
    return this.agendaRepository.findAll();
  }

  async assign(dto: AssignSlotDto): Promise<void> {
    const slot = new AgendaSlot(dto.dayOfWeek, dto.hour, dto.occupantType, {
      studentId: dto.studentId,
      studentName: dto.studentName,
      turmaId: dto.turmaId,
      turmaName: dto.turmaName,
    });
    await this.agendaRepository.upsert(slot);
  }

  free(dayOfWeek: number, hour: number): Promise<void> {
    return this.agendaRepository.remove(dayOfWeek, hour);
  }

  /**
   * Horário resolvido do aluno: alocações diretas (individual) +
   * slots das turmas às quais ele pertence.
   */
  async getStudentSchedule(studentId: string): Promise<StudentSchedule[]> {
    const direct = await this.agendaRepository.findByStudentId(studentId);

    const turmas = await this.turmaRepository.findAll();
    const turmaIds = turmas
      .filter((t) => t.studentIds.includes(studentId))
      .map((t) => t.id)
      .filter((id): id is string => !!id);
    const turmaSlots = await this.agendaRepository.findByTurmaIds(turmaIds);

    const individual: StudentSchedule[] = direct.map((s) => ({
      dayOfWeek: s.dayOfWeek,
      hour: s.hour,
      kind: 'individual',
    }));
    const group: StudentSchedule[] = turmaSlots.map((s) => ({
      dayOfWeek: s.dayOfWeek,
      hour: s.hour,
      kind: 'turma',
      turmaName: s.turmaName,
    }));

    return [...individual, ...group].sort(
      (a, b) => a.dayOfWeek - b.dayOfWeek || a.hour - b.hour,
    );
  }
}
