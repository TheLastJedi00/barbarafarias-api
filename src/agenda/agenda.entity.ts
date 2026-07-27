export type OccupantType = 'student' | 'turma';

/**
 * Slot da agenda semanal recorrente de UMA professora, identificado por
 * (teacherId, dayOfWeek, hour). Comporta um ocupante: um aluno avulso OU uma
 * turma (nunca ambos). Persistido com docId `${teacherId}_${dayOfWeek}_${hour}`
 * — garante 1 ocupante por slot da professora e permite que duas professoras
 * usem o mesmo dia/hora (spec 010 §5.4).
 */
export class AgendaSlot {
  teacherId: string;
  teacherName?: string;
  dayOfWeek: number; // 0=domingo … 6=sábado
  hour: number; // 8..20
  occupantType: OccupantType;
  studentId?: string;
  studentName?: string;
  turmaId?: string;
  turmaName?: string;

  constructor(
    teacherId: string,
    dayOfWeek: number,
    hour: number,
    occupantType: OccupantType,
    fields: Partial<
      Pick<
        AgendaSlot,
        'teacherName' | 'studentId' | 'studentName' | 'turmaId' | 'turmaName'
      >
    > = {},
  ) {
    this.teacherId = teacherId;
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
  teacherId?: string;
  teacherName?: string;
}
