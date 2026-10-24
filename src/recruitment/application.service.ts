import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NotificationService } from '../notifications/notification.service';
import { ApplicationRepository } from './application.repository';
import { CandidateRepository } from './candidate.repository';
import { JobRepository } from './job.repository';
import {
  Application,
  ApplicationStatus,
  DECIDED_STATUSES,
  applicationId,
} from './application.model';
import { Candidate, needsConsent } from './candidate.model';
import { Job, JobStatus } from './job.model';

/** Candidatura vista com a vaga ao lado (painel do candidato, detalhe). */
export interface ApplicationWithJob {
  id: string;
  jobId: string;
  jobTitle: string;
  jobStatus: JobStatus;
  status: ApplicationStatus;
  createdAt: string;
  updatedAt: string;
}

/** Linha do banco de talentos: contato, sem caminhos do Storage. */
export interface CandidateSummary {
  id: string;
  name: string;
  email: string;
  phone: string;
  linkedinUrl?: string;
  hasResume: boolean;
  resumeFileName?: string;
  applicationsCount: number;
  createdAt: string;
}

export interface CandidateDetail extends CandidateSummary {
  consentAt: string;
  consentVersion: string;
  applications: ApplicationWithJob[];
}

/** Candidato de uma vaga: a candidatura com o resumo da pessoa. */
export interface JobApplicant {
  id: string;
  status: ApplicationStatus;
  createdAt: string;
  updatedAt: string;
  candidate: CandidateSummary;
}

/** Resultado da mudança de etapa, para quem avisa o candidato. */
export interface StatusChange {
  application: Application;
  previousStatus: ApplicationStatus;
}

/**
 * Candidaturas (spec 028): o candidato se candidata e retira; a gerente vê o
 * banco de talentos, os candidatos de cada vaga e muda a etapa.
 */
@Injectable()
export class ApplicationService {
  constructor(
    private readonly applications: ApplicationRepository,
    private readonly jobs: JobRepository,
    private readonly candidates: CandidateRepository,
    private readonly notifications: NotificationService,
  ) {}

  /**
   * Exige vaga aberta, currículo enviado e o termo vigente aceito. O id
   * determinístico faz a repetição cair no mesmo doc — o 409 é a mensagem.
   */
  async apply(candidateId: string, jobId: string): Promise<ApplicationWithJob> {
    const job = await this.jobs.findById(jobId);
    if (!job) throw new NotFoundException('Vaga não encontrada');
    if (job.status !== 'open') {
      throw new ConflictException(
        'Esta vaga não está mais recebendo candidaturas.',
      );
    }

    const candidate = await this.getCandidate(candidateId);
    if (needsConsent(candidate)) {
      throw new ConflictException(
        'O Termo de Tratamento de Dados mudou. Aceite a nova versão para se candidatar.',
      );
    }
    if (!candidate.resume) {
      throw new ConflictException(
        'Envie seu currículo antes de se candidatar.',
      );
    }

    const id = applicationId(jobId, candidateId);
    if (await this.applications.findById(id)) {
      throw new ConflictException('Você já se candidatou a esta vaga.');
    }

    const now = new Date().toISOString();
    const application: Application = {
      id,
      jobId,
      candidateId,
      status: 'received',
      createdAt: now,
      updatedAt: now,
    };
    await this.applications.save(application);
    // Nunca lança: e-mail fora do ar não desfaz a candidatura.
    await this.notifications.applicationReceived(job.title, candidate.name);
    return withJob(application, job);
  }

  async withdraw(candidateId: string, jobId: string): Promise<void> {
    const application = await this.applications.findById(
      applicationId(jobId, candidateId),
    );
    if (!application) throw new NotFoundException('Candidatura não encontrada');
    if (DECIDED_STATUSES.includes(application.status)) {
      throw new ConflictException(
        'Esta candidatura já foi concluída e não pode ser retirada.',
      );
    }
    await this.applications.delete(application.id);
  }

  async listMine(candidateId: string): Promise<ApplicationWithJob[]> {
    const [applications, jobs] = await Promise.all([
      this.applications.findByCandidate(candidateId),
      this.jobs.findAll(),
    ]);
    return joinJobs(applications, jobs);
  }

  async listTalentPool(): Promise<CandidateSummary[]> {
    const [candidates, applications] = await Promise.all([
      this.candidates.findAll(),
      this.applications.findAll(),
    ]);
    const counts = countBy(applications, (a) => a.candidateId);
    return byNewest(candidates).map((c) => summarize(c, counts.get(c.id) ?? 0));
  }

  async listByJob(jobId: string): Promise<JobApplicant[]> {
    if (!(await this.jobs.findById(jobId))) {
      throw new NotFoundException('Vaga não encontrada');
    }
    const [applications, candidates, all] = await Promise.all([
      this.applications.findByJob(jobId),
      this.candidates.findAll(),
      this.applications.findAll(),
    ]);
    const byId = new Map(candidates.map((c) => [c.id, c]));
    const counts = countBy(all, (a) => a.candidateId);

    return byNewest(applications).flatMap((application) => {
      const candidate = byId.get(application.candidateId);
      // Candidato excluído entre uma leitura e outra: some da lista.
      if (!candidate) return [];
      return [
        {
          id: application.id,
          status: application.status,
          createdAt: application.createdAt,
          updatedAt: application.updatedAt,
          candidate: summarize(candidate, counts.get(candidate.id) ?? 0),
        },
      ];
    });
  }

  async getCandidateDetail(candidateId: string): Promise<CandidateDetail> {
    const candidate = await this.getCandidate(candidateId);
    const applications = await this.listMine(candidateId);
    return {
      ...summarize(candidate, applications.length),
      consentAt: candidate.consentAt,
      consentVersion: candidate.consentVersion,
      applications,
    };
  }

  /** Só a gerente muda a etapa. Mesma etapa não grava nem avisa. */
  async updateStatus(
    id: string,
    status: ApplicationStatus,
  ): Promise<StatusChange> {
    const current = await this.applications.findById(id);
    if (!current) throw new NotFoundException('Candidatura não encontrada');
    if (current.status === status) {
      return { application: current, previousStatus: current.status };
    }

    const application: Application = {
      ...current,
      status,
      updatedAt: new Date().toISOString(),
    };
    await this.applications.save(application);
    await this.notifyStatus(application);
    return { application, previousStatus: current.status };
  }

  /** Best-effort: candidato ou vaga sumidos só deixam de receber o aviso. */
  private async notifyStatus(application: Application): Promise<void> {
    const [candidate, job] = await Promise.all([
      this.candidates.findById(application.candidateId),
      this.jobs.findById(application.jobId),
    ]);
    if (!candidate || !job) return;
    await this.notifications.applicationStatusChanged(
      candidate.email,
      candidate.name,
      job.title,
      application.status,
    );
  }

  private async getCandidate(id: string): Promise<Candidate> {
    const candidate = await this.candidates.findById(id);
    if (!candidate) throw new NotFoundException('Candidato não encontrado');
    return candidate;
  }
}

function withJob(application: Application, job: Job): ApplicationWithJob {
  return {
    id: application.id,
    jobId: application.jobId,
    jobTitle: job.title,
    jobStatus: job.status,
    status: application.status,
    createdAt: application.createdAt,
    updatedAt: application.updatedAt,
  };
}

/** Candidatura de vaga já excluída não aparece (a exclusão leva as duas). */
function joinJobs(
  applications: Application[],
  jobs: Job[],
): ApplicationWithJob[] {
  const byId = new Map(jobs.map((job) => [job.id, job]));
  return byNewest(applications).flatMap((application) => {
    const job = byId.get(application.jobId);
    return job ? [withJob(application, job)] : [];
  });
}

function summarize(
  candidate: Candidate,
  applicationsCount: number,
): CandidateSummary {
  return {
    id: candidate.id,
    name: candidate.name,
    email: candidate.email,
    phone: candidate.phone,
    ...(candidate.linkedinUrl ? { linkedinUrl: candidate.linkedinUrl } : {}),
    hasResume: Boolean(candidate.resume),
    ...(candidate.resume ? { resumeFileName: candidate.resume.fileName } : {}),
    applicationsCount,
    createdAt: candidate.createdAt,
  };
}

function countBy<T>(items: T[], key: (item: T) => string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
  }
  return counts;
}

function byNewest<T extends { createdAt: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
