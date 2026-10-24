export const JOB_STATUSES = ['open', 'closed'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

/** Vaga do Trabalhe Conosco (spec 028), na coleção `jobs`. */
export interface Job {
  id: string;
  title: string;
  description: string;
  requirements?: string;
  /** Texto livre: "Remoto", "Presencial em Goiânia"… */
  modality?: string;
  /** Texto livre: "20 h/semana", "Por turma"… */
  workload?: string;
  status: JobStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/** O que a vitrine pública mostra: nada de quem criou nem do estado interno. */
export type PublicJob = Pick<
  Job,
  | 'id'
  | 'title'
  | 'description'
  | 'requirements'
  | 'modality'
  | 'workload'
  | 'createdAt'
>;

/** Visão da gerente: a vaga com quantas candidaturas recebeu. */
export type ManagedJob = Job & { applicationsCount: number };

export function toPublicJob(job: Job): PublicJob {
  return {
    id: job.id,
    title: job.title,
    description: job.description,
    ...(job.requirements ? { requirements: job.requirements } : {}),
    ...(job.modality ? { modality: job.modality } : {}),
    ...(job.workload ? { workload: job.workload } : {}),
    createdAt: job.createdAt,
  };
}
