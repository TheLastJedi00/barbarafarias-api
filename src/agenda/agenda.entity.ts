import { DEFAULT_SLOT_COUNT, SLOT_STEP } from '../common/slot-time';

export type OccupantType = 'student' | 'turma';

/**
 * Slot da agenda semanal recorrente de UMA professora, identificado por
 * (teacherId, dayOfWeek, hour). Comporta um ocupante: um aluno avulso OU uma
 * turma (nunca ambos). Persistido com docId `${teacherId}_${dayOfWeek}_${hour}`
 * — garante 1 ocupante por slot da professora e permite que duas professoras
 * usem o mesmo dia/hora (spec 010 §5.4).
 *
 * `hour` é decimal em passos de 30 min (`8` = 08:00, `8.5` = 08:30, spec 011
 * RF4). Uma aula de 1 hora grava DOIS documentos consecutivos apontando para o
 * mesmo `startHour` — a grade mostra as duas metades ocupadas e liberar
 * qualquer uma delas derruba o bloco inteiro (RF5).
 */
export class AgendaSlot {
  teacherId: string;
  teacherName?: string;
  dayOfWeek: number; // 0=domingo … 6=sábado
  hour: number; // 8 … 20.5, em passos de 0.5
  occupantType: OccupantType;
  studentId?: string;
  studentName?: string;
  turmaId?: string;
  turmaName?: string;
  /** Início do bloco ao qual este slot pertence. */
  startHour: number;
  /** Slots de 30 min que o bloco ocupa (1 = meia hora, 2 = uma hora). */
  slotCount: number;

  constructor(
    teacherId: string,
    dayOfWeek: number,
    hour: number,
    occupantType: OccupantType,
    fields: Partial<
      Pick<
        AgendaSlot,
        | 'teacherName'
        | 'studentId'
        | 'studentName'
        | 'turmaId'
        | 'turmaName'
        | 'startHour'
        | 'slotCount'
      >
    > = {},
  ) {
    this.teacherId = teacherId;
    this.dayOfWeek = dayOfWeek;
    this.occupantType = occupantType;
    Object.assign(this, fields);
    this.hour = hour;
    this.startHour = fields.startHour ?? hour;
    this.slotCount = fields.slotCount ?? DEFAULT_SLOT_COUNT;
  }

  /** Todas as meias-horas cobertas pelo bloco deste slot. */
  coveredHours(): number[] {
    return Array.from(
      { length: this.slotCount },
      (_, index) => this.startHour + index * SLOT_STEP,
    );
  }

  /** O bloco deste slot ocupa a meia-hora informada? */
  covers(hour: number): boolean {
    return this.coveredHours().includes(hour);
  }

  /** Este slot é o começo do bloco (o que carrega o rótulo na grade)? */
  isBlockStart(): boolean {
    return this.hour === this.startHour;
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
  /** Duração em slots de 30 min, para o card do aluno mostrar o intervalo. */
  slotCount: number;
}
