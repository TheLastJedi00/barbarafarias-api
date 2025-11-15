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
