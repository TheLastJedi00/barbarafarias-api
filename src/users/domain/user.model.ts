export class User {
  private id: string | undefined;
  private fullName: string;
  private phone: string;
  private email: string;
  private isPaying: boolean;
  private isTeacher: boolean;
  private level: string;
  private objectives: string;
  private prognosis: string;

  constructor(
    fullName: string,
    phone: string,
    email: string,
    isPaying: boolean,
    isTeacher: boolean,
    level: string,
    objectives: string,
    prognosis: string,
    id?: string,
  ) {
    this.fullName = fullName;
    this.phone = phone;
    this.email = email;
    this.isPaying = isPaying;
    this.isTeacher = isTeacher;
    this.level = level;
    this.objectives = objectives;
    this.prognosis = prognosis;
    this.id = id;
  }

  getId(): string {
    return this.id!;
  }
  getFullName(): string {
    return this.fullName;
  }
  getObjectives(): string {
    return this.objectives;
  }
  getPrognosis(): string {
    return this.prognosis;
  }
  haveTeacherRole(): boolean {
    return this.isTeacher;
  }
  getCreatedAt(): Date {
    return new Date();
  }
  getUpdatedAt(): Date {
    return new Date();
  }

  toPlainObject() {
    return {
      fullName: this.fullName,
      phone: this.phone,
      email: this.email,
      isPaying: this.isPaying,
      isTeacher: this.isTeacher,
      level: this.level,
      objectives: this.objectives,
      prognosis: this.prognosis,
    };
  }
}
