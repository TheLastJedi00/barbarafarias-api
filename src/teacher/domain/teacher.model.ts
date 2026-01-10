export class Teacher {
  readonly fullName: string;
  readonly email: string;
  readonly isTeacher: boolean;

  constructor(fullName: string, email: string, isTeacher: boolean) {
    this.fullName = fullName;
    this.email = email;
    this.isTeacher = isTeacher;
  }
}
