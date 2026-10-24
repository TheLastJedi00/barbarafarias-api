import { Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';
import { ApplicationRepository } from './application.repository';
import { JobRepository } from './job.repository';
import { CreateJobDto, UpdateJobDto } from './dto/job.dto';
import { Job, ManagedJob, PublicJob, toPublicJob } from './job.model';

const OPTIONAL_FIELDS = ['requirements', 'modality', 'workload'] as const;

/** CRUD das vagas e a vitrine pública (spec 028). */
@Injectable()
export class JobService {
  constructor(
    private readonly jobs: JobRepository,
    private readonly applications: ApplicationRepository,
  ) {}

  async listOpen(): Promise<PublicJob[]> {
    const open = await this.jobs.findByStatus('open');
    return byNewest(open).map(toPublicJob);
  }

  async listAll(): Promise<ManagedJob[]> {
    const [jobs, applications] = await Promise.all([
      this.jobs.findAll(),
      this.applications.findAll(),
    ]);
    const counts = new Map<string, number>();
    for (const { jobId } of applications) {
      counts.set(jobId, (counts.get(jobId) ?? 0) + 1);
    }

    return byNewest(jobs)
      .sort((a, b) => Number(b.status === 'open') - Number(a.status === 'open'))
      .map((job) => ({ ...job, applicationsCount: counts.get(job.id) ?? 0 }));
  }

  async findById(id: string): Promise<Job> {
    const job = await this.jobs.findById(id);
    if (!job) throw new NotFoundException('Vaga não encontrada');
    return job;
  }

  async create(dto: CreateJobDto, user: AuthenticatedUser): Promise<Job> {
    const now = new Date().toISOString();
    const job: Job = withOptionals(
      {
        id: this.jobs.newId(),
        title: dto.title.trim(),
        description: dto.description.trim(),
        status: dto.status ?? 'open',
        createdBy: user.sub,
        createdAt: now,
        updatedAt: now,
      },
      dto,
    );
    await this.jobs.save(job);
    return job;
  }

  async update(id: string, dto: UpdateJobDto): Promise<Job> {
    const current = await this.findById(id);
    const job: Job = withOptionals(
      {
        ...current,
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description.trim() }
          : {}),
        ...(dto.status ? { status: dto.status } : {}),
        updatedAt: new Date().toISOString(),
      },
      dto,
    );
    await this.jobs.save(job);
    return job;
  }

  /**
   * Vaga excluída leva as candidaturas junto (spec 028 §4); os candidatos
   * continuam no banco de talentos. As candidaturas saem primeiro: se a vaga
   * sumisse antes e a segunda etapa falhasse, sobrariam candidaturas órfãs.
   */
  async remove(id: string): Promise<void> {
    await this.findById(id);
    const applications = await this.applications.findByJob(id);
    await this.applications.deleteMany(applications.map((a) => a.id));
    await this.jobs.delete(id);
  }
}

function byNewest<T extends { createdAt: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Aplica os campos opcionais do DTO: ausente mantém, texto em branco apaga.
 */
function withOptionals(
  job: Job,
  dto: Partial<Record<(typeof OPTIONAL_FIELDS)[number], string>>,
): Job {
  const result: Job = { ...job };
  for (const field of OPTIONAL_FIELDS) {
    const value = dto[field];
    if (value === undefined) continue;
    const trimmed = value.trim();
    if (trimmed) {
      result[field] = trimmed;
    } else {
      delete result[field];
    }
  }
  return result;
}
