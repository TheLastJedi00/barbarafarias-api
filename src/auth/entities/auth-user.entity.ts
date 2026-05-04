export class AuthUser {
  id: string;
  email: string;
  password?: string;
  role: string;

  constructor(data: Partial<AuthUser>) {
    Object.assign(this, data);
  }
}
