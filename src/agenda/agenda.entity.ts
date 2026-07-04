export type OccupantType = 'student' | 'turma';

/**
 * Slot da agenda semanal recorrente. Identificado por (dayOfWeek, hour).
 * Comporta UM ocupante: um aluno avulso OU uma turma (nunca ambos).
 * Persistido com docId = `${dayOfWeek}_${hour}` (garante 1 ocupante por slot).
 */
export class AgendaSlot {
  dayOfWeek: number; // 0=domingo … 6=sábado
  hour: number; // 8..20
  occupantType: OccupantType;
  studentId?: string;
  studentName?: string;
  turmaId?: string;
  turmaName?: string;

  constructor(
    dayOfWeek: number,
    hour: number,
    occupantType: OccupantType,
    fields: Partial<
      Pick<AgendaSlot, 'studentId' | 'studentName' | 'turmaId' | 'turmaName'>
    > = {},
  ) {
    this.dayOfWeek = dayOfWeek;
    this.hour = hour;
    this.occupantType = occupantType;
    Object.assign(this, fields);
  }
}

/** Horário resolvido para exibir ao aluno (aula individual ou de turma). */
export interface StudentSchedule {
  dayOfWeek: number;
  hour: number;
  kind: 'individual' | 'turma';
  turmaName?: string;
}
