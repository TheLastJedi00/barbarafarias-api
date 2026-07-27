/**
 * Turma: grupo nomeado de alunos que pode ser alocado num slot da agenda.
 * studentNames é denormalizado (enviado pelo frontend) para exibição sem join.
 * A partir da spec 010 a turma tem professora responsável e sala de Meet
 * própria — a aula de turma vale 1 hora no financeiro, independentemente do
 * número de alunos.
 */
export class Turma {
  id?: string;
  name: string;
  studentIds: string[];
  studentNames: string[];
  teacherId?: string;
  teacherName?: string;
  meetUrl?: string;

  constructor(
    name: string,
    studentIds: string[],
    studentNames: string[],
    id?: string,
    extras: Partial<Pick<Turma, 'teacherId' | 'teacherName' | 'meetUrl'>> = {},
  ) {
    this.name = name;
    this.studentIds = studentIds;
    this.studentNames = studentNames;
    if (id) this.id = id;
    Object.assign(this, extras);
  }
}
