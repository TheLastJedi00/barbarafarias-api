import { ConflictException, NotFoundException } from '@nestjs/common';
import { ApplicationService } from './application.service';
import { Application } from './application.model';
import { Candidate } from './candidate.model';

const RECRUITMENT_TERMS_VERSION = '1.0';
import { Job } from './job.model';

const resume = {
  storagePath: 'candidates/cand-1/resume-x.pdf',
  fileName: 'cv.pdf',
  mimeType: 'application/pdf',
  size: 1000,
  uploadedAt: '2026-10-24T00:00:00.000Z',
};

function candidate(overrides: Partial<Candidate> = {}): Candidate {
  return {
    id: 'cand-1',
    email: 'ana@exemplo.com',
    name: 'Ana Souza',
    phone: '62999998888',
    resume,
    consentAt: '2026-10-24T00:00:00.000Z',
    consentVersion: RECRUITMENT_TERMS_VERSION,
    createdAt: '2026-10-24T00:00:00.000Z',
    updatedAt: '2026-10-24T00:00:00.000Z',
    ...overrides,
  };
}

function job(overrides: Partial<Job> = {}): Job {
  return {
    id: 'j1',
    title: 'Professora de inglês',
    description: 'Aulas online',
    status: 'open',
    createdBy: 'manager-1',
    createdAt: '2026-10-20T00:00:00.000Z',
    updatedAt: '2026-10-20T00:00:00.000Z',
    ...overrides,
  };
}

function application(overrides: Partial<Application> = {}): Application {
  return {
    id: 'j1_cand-1',
    jobId: 'j1',
    candidateId: 'cand-1',
    status: 'received',
    createdAt: '2026-10-24T00:00:00.000Z',
    updatedAt: '2026-10-24T00:00:00.000Z',
    ...overrides,
  };
}

function setup() {
  const applications = {
    findById: jest.fn().mockResolvedValue(null),
    findAll: jest.fn().mockResolvedValue([]),
    findByJob: jest.fn().mockResolvedValue([]),
    findByCandidate: jest.fn().mockResolvedValue([]),
    save: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
  };
  const jobs = {
    findById: jest.fn().mockResolvedValue(job()),
    findAll: jest.fn().mockResolvedValue([job()]),
  };
  const candidates = {
    findById: jest.fn().mockResolvedValue(candidate()),
    findAll: jest.fn().mockResolvedValue([]),
  };
  const notifications = {
    applicationReceived: jest.fn().mockResolvedValue(undefined),
    applicationStatusChanged: jest.fn().mockResolvedValue(undefined),
  };
  const legal = {
    requirement: jest.fn().mockResolvedValue({
      publishedVersion: RECRUITMENT_TERMS_VERSION,
      requiredVersion: RECRUITMENT_TERMS_VERSION,
    }),
  };
  const service = new ApplicationService(
    applications as any,
    jobs as any,
    candidates as any,
    notifications as any,
    legal as any,
  );
  return { service, applications, jobs, candidates, notifications, legal };
}

describe('ApplicationService — candidato (spec 028)', () => {
  describe('apply', () => {
    it('grava a candidatura recebida com id determinístico', async () => {
      const { service, applications } = setup();

      const view = await service.apply('cand-1', 'j1');

      const saved: Application = applications.save.mock.calls[0][0];
      expect(saved).toMatchObject({
        id: 'j1_cand-1',
        jobId: 'j1',
        candidateId: 'cand-1',
        status: 'received',
      });
      expect(view).toMatchObject({
        jobTitle: 'Professora de inglês',
        jobStatus: 'open',
        status: 'received',
      });
    });

    it('vaga inexistente é 404 e vaga fechada é 409', async () => {
      const { service, jobs } = setup();
      jobs.findById.mockResolvedValueOnce(null);
      await expect(service.apply('cand-1', 'x')).rejects.toBeInstanceOf(
        NotFoundException,
      );

      jobs.findById.mockResolvedValueOnce(job({ status: 'closed' }));
      await expect(service.apply('cand-1', 'j1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('sem currículo é 409', async () => {
      const { service, candidates, applications } = setup();
      candidates.findById.mockResolvedValue(candidate({ resume: undefined }));

      await expect(service.apply('cand-1', 'j1')).rejects.toThrow(/currículo/);
      expect(applications.save).not.toHaveBeenCalled();
    });

    it('termo aceito numa versão anterior é 409 até o novo aceite', async () => {
      const { service, candidates } = setup();
      candidates.findById.mockResolvedValue(
        candidate({ consentVersion: '0.9' }),
      );

      await expect(service.apply('cand-1', 'j1')).rejects.toThrow(/Termo/);
    });

    it('candidatura repetida é 409', async () => {
      const { service, applications } = setup();
      applications.findById.mockResolvedValue(application());

      await expect(service.apply('cand-1', 'j1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(applications.findById).toHaveBeenCalledWith('j1_cand-1');
      expect(applications.save).not.toHaveBeenCalled();
    });
  });

  describe('withdraw', () => {
    it('retira enquanto não há decisão', async () => {
      const { service, applications } = setup();
      applications.findById.mockResolvedValue(
        application({ status: 'interview' }),
      );

      await service.withdraw('cand-1', 'j1');

      expect(applications.delete).toHaveBeenCalledWith('j1_cand-1');
    });

    it('depois de aprovada ou recusada é 409', async () => {
      const { service, applications } = setup();
      applications.findById.mockResolvedValue(
        application({ status: 'rejected' }),
      );

      await expect(service.withdraw('cand-1', 'j1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(applications.delete).not.toHaveBeenCalled();
    });

    it('sem candidatura é 404', async () => {
      const { service } = setup();
      await expect(service.withdraw('cand-1', 'j1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  it('listMine: candidaturas com título e situação da vaga, mais novas primeiro', async () => {
    const { service, applications, jobs } = setup();
    applications.findByCandidate.mockResolvedValue([
      application({
        id: 'a',
        jobId: 'j1',
        createdAt: '2026-10-01T00:00:00.000Z',
      }),
      application({
        id: 'b',
        jobId: 'j2',
        createdAt: '2026-10-10T00:00:00.000Z',
      }),
    ]);
    jobs.findAll.mockResolvedValue([
      job(),
      job({ id: 'j2', title: 'Coordenação', status: 'closed' }),
    ]);

    const result = await service.listMine('cand-1');

    expect(applications.findByCandidate).toHaveBeenCalledWith('cand-1');
    expect(result.map((a) => [a.id, a.jobTitle, a.jobStatus])).toEqual([
      ['b', 'Coordenação', 'closed'],
      ['a', 'Professora de inglês', 'open'],
    ]);
  });
});

describe('ApplicationService — gerente (spec 028)', () => {
  it('banco de talentos: todo candidato, sem caminhos do Storage, com a contagem de candidaturas', async () => {
    const { service, candidates, applications } = setup();
    candidates.findAll.mockResolvedValue([
      candidate({ id: 'velho', createdAt: '2026-01-01T00:00:00.000Z' }),
      candidate({
        id: 'novo',
        resume: undefined,
        createdAt: '2026-10-01T00:00:00.000Z',
      }),
    ]);
    applications.findAll.mockResolvedValue([
      application({ candidateId: 'velho' }),
      application({ id: 'x', candidateId: 'velho', jobId: 'j2' }),
    ]);

    const result = await service.listTalentPool();

    expect(result.map((c) => [c.id, c.hasResume, c.applicationsCount])).toEqual(
      [
        ['novo', false, 0],
        ['velho', true, 2],
      ],
    );
    expect(JSON.stringify(result)).not.toContain('storagePath');
  });

  it('candidatos de uma vaga, com o resumo de cada um', async () => {
    const { service, applications, candidates } = setup();
    applications.findByJob.mockResolvedValue([
      application(),
      application({ id: 'j1_sumiu', candidateId: 'sumiu' }),
    ]);
    candidates.findAll.mockResolvedValue([candidate()]);

    const result = await service.listByJob('j1');

    expect(applications.findByJob).toHaveBeenCalledWith('j1');
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 'j1_cand-1',
      status: 'received',
      candidate: { id: 'cand-1', name: 'Ana Souza', hasResume: true },
    });
  });

  it('candidatos de vaga inexistente é 404', async () => {
    const { service, jobs } = setup();
    jobs.findById.mockResolvedValue(null);
    await expect(service.listByJob('x')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('detalhe do candidato traz as candidaturas e o aceite do termo', async () => {
    const { service, applications } = setup();
    applications.findByCandidate.mockResolvedValue([application()]);

    const detail = await service.getCandidateDetail('cand-1');

    expect(detail).toMatchObject({
      id: 'cand-1',
      consentVersion: RECRUITMENT_TERMS_VERSION,
      applications: [{ jobTitle: 'Professora de inglês', status: 'received' }],
    });
  });

  it('muda a etapa e devolve a anterior para quem precisar avisar', async () => {
    const { service, applications } = setup();
    applications.findById.mockResolvedValue(application());

    const result = await service.updateStatus('j1_cand-1', 'interview');

    const saved: Application = applications.save.mock.calls[0][0];
    expect(saved.status).toBe('interview');
    expect(saved.updatedAt).not.toBe('2026-10-24T00:00:00.000Z');
    expect(result).toMatchObject({ previousStatus: 'received' });
  });

  it('mesma etapa não grava nada', async () => {
    const { service, applications } = setup();
    applications.findById.mockResolvedValue(application());

    await service.updateStatus('j1_cand-1', 'received');

    expect(applications.save).not.toHaveBeenCalled();
  });

  it('mudar etapa de candidatura inexistente é 404', async () => {
    const { service } = setup();
    await expect(service.updateStatus('x', 'interview')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('ApplicationService — avisos por e-mail (spec 028)', () => {
  it('nova candidatura avisa as gerentes com a vaga e o nome', async () => {
    const { service, notifications } = setup();

    await service.apply('cand-1', 'j1');

    expect(notifications.applicationReceived).toHaveBeenCalledWith(
      'Professora de inglês',
      'Ana Souza',
    );
  });

  it('mudança de etapa avisa o candidato', async () => {
    const { service, applications, notifications } = setup();
    applications.findById.mockResolvedValue(application());

    await service.updateStatus('j1_cand-1', 'reviewing');

    expect(notifications.applicationStatusChanged).toHaveBeenCalledWith(
      'ana@exemplo.com',
      'Ana Souza',
      'Professora de inglês',
      'reviewing',
    );
  });

  it('mesma etapa não avisa ninguém', async () => {
    const { service, applications, notifications } = setup();
    applications.findById.mockResolvedValue(application());

    await service.updateStatus('j1_cand-1', 'received');

    expect(notifications.applicationStatusChanged).not.toHaveBeenCalled();
  });
});
