/** Fonte única para os papéis de usuário, evitando magic strings. */
export const ROLES = {
  MANAGER: 'manager',
  TEACHER: 'teacher',
  STUDENT: 'student',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

const KNOWN_ROLES: string[] = Object.values(ROLES);

/**
 * Resolve o papel durante a migração de `isTeacher` para `role`: enquanto houver
 * documentos sem `role`, o booleano legado ainda decide.
 */
export function resolveRole(user: {
  role?: string | null;
  isTeacher?: boolean;
}): Role {
  if (user.role && KNOWN_ROLES.includes(user.role)) {
    return user.role as Role;
  }
  return user.isTeacher ? ROLES.TEACHER : ROLES.STUDENT;
}

/** Papéis que operam aulas — a gerente também pode ser professora responsável. */
export function isStaff(role: Role): boolean {
  return role === ROLES.MANAGER || role === ROLES.TEACHER;
}
