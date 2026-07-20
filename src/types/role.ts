/** Fonte única para os papéis de usuário, evitando magic strings. */
export const ROLES = {
  TEACHER: 'teacher',
  STUDENT: 'student',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];
