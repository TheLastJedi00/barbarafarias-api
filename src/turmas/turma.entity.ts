/**
 * Turma: grupo nomeado de alunos que pode ser alocado num slot da agenda.
 * studentNames é denormalizado (enviado pelo frontend) para exibição sem join.
 */
export class Turma {
  id?: string;
  name: string;
  studentIds: string[];
  studentNames: string[];

  constructor(
    name: string,
    studentIds: string[],
    studentNames: string[],
    id?: string,
  ) {
    this.name = name;
    this.studentIds = studentIds;
    this.studentNames = studentNames;
    if (id) this.id = id;
  }
}
