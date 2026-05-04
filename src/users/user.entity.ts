export class User {
  id: string | undefined;
  fullName!: string;
  phone!: string;
  email!: string;
  isPaying!: boolean;
  isTeacher!: boolean;
  level!: string;
  objective!: string;
  prognosis!: string;

  constructor(data: Partial<User>) {
    Object.assign(this, data);
  }

}
