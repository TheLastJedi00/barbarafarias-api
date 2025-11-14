export class User {
  private id: string | undefined;
  private fullName: string;
  private phone: string;
  private email: string;
  private objectives: string;
  private prognosis: string;

  constructor(
    fullName: string,
    phone: string,
    email: string,
    objectives: string,
    prognosis: string,
    id?: string,
  ) {
    this.fullName = fullName;
    this.phone = phone;
    this.email = email;
    this.objectives = objectives;
    this.prognosis = prognosis;
    this.id = id;
  }
}
