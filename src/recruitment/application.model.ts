/**
 * Etapas da candidatura (spec 028 §10), na ordem do processo. O candidato vê a
 * etapa; só a gerente a muda.
 */
export const APPLICATION_STATUSES = [
  'received',
  'reviewing',
  'interview',
  'approved',
  'rejected',
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

/** Depois da decisão o candidato já não retira a candidatura. */
export const DECIDED_STATUSES: ApplicationStatus[] = ['approved', 'rejected'];

/**
 * Candidatura, na coleção `applications`. O id é `{jobId}_{candidateId}`: a
 * mesma pessoa não se candidata duas vezes à mesma vaga, sem transação.
 */
export interface Application {
  id: string;
  jobId: string;
  candidateId: string;
  status: ApplicationStatus;
  createdAt: string;
  updatedAt: string;
}

export function applicationId(jobId: string, candidateId: string): string {
  return `${jobId}_${candidateId}`;
}
