import { NotFoundException } from '@nestjs/common';
import { JobService } from './job.service';
import { Job } from './job.model';

const manager = { sub: 'manager-1', email: 'm@x', role: 'manager' as const };

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

function setup() {
  const jobs = {
    newId: jest.fn().mockReturnValue('j-new'),
    findById: jest.fn().mockResolvedValue(job()),
    findAll: jest.fn().mockResolvedValue([]),
    findByStatus: jest.fn().mockResolvedValue([]),
    save: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
  };
  const applications = {
    findAll: jest.fn().mockResolvedValue([]),
    findByJob: jest.fn().mockResolvedValue([]),
    deleteMany: jest.fn().mockResolvedValue(undefined),
  };
  const service = new JobService(jobs as any, applications as any);
  return { service, jobs, applications };
}

describe('JobService (spec 028)', () => {
  describe('listOpen (vitrine pública)', () => {
    it('consulta só as abertas e devolve só campos de exibição, mais novas primeiro', async () => {
      const { service, jobs } = setup();
      jobs.findByStatus.mockResolvedValue([
        job({ id: 'antiga', createdAt: '2026-01-01T00:00:00.000Z' }),
        job({
          id: 'nova',
          createdAt: '2026-10-01T00:00:00.000Z',
          modality: 'Remoto',
        }),
      ]);

      const result = await service.listOpen();

      expect(jobs.findByStatus).toHaveBeenCalledWith('open');
      expect(result.map((j) => j.id)).toEqual(['nova', 'antiga']);
      expect(result[0]).not.toHaveProperty('createdBy');
      expect(result[0]).not.toHaveProperty('status');
      expect(result[0].modality).toBe('Remoto');
    });
  });

  describe('listAll (gerente)', () => {
    it('soma as candidaturas de cada vaga, com abertas antes das fechadas', async () => {
      const { service, jobs, applications } = setup();
      jobs.findAll.mockResolvedValue([
        job({ id: 'fechada', status: 'closed' }),
        job({ id: 'aberta' }),
      ]);
      applications.findAll.mockResolvedValue([
        { id: 'a1', jobId: 'aberta' },
        { id: 'a2', jobId: 'aberta' },
        { id: 'a3', jobId: 'fechada' },
      ]);

      const result = await service.listAll();

      expect(result.map((j) => [j.id, j.applicationsCount])).toEqual([
        ['aberta', 2],
        ['fechada', 1],
      ]);
    });
  });

  describe('create', () => {
    it('grava aberta por padrão, com autoria e datas', async () => {
      const { service, jobs } = setup();

      const created = await service.create(
        { title: ' Professora ', description: 'Aulas', modality: '' },
        manager,
      );

      expect(created).toMatchObject({
        id: 'j-new',
        title: 'Professora',
        status: 'open',
        createdBy: 'manager-1',
      });
      expect(created).not.toHaveProperty('modality');
      expect(jobs.save).toHaveBeenCalledWith(created);
    });

    it('aceita criar já fechada (rascunho)', async () => {
      const { service } = setup();
      const created = await service.create(
        { title: 'T', description: 'D', status: 'closed' },
        manager,
      );
      expect(created.status).toBe('closed');
    });
  });

  describe('update', () => {
    it('muda só o que veio e string vazia apaga o opcional', async () => {
      const { service, jobs } = setup();
      jobs.findById.mockResolvedValue(
        job({ modality: 'Remoto', workload: '20 h' }),
      );

      const updated = await service.update('j1', {
        status: 'closed',
        modality: '',
      });

      expect(updated.status).toBe('closed');
      expect(updated.title).toBe('Professora de inglês');
      expect(updated).not.toHaveProperty('modality');
      expect(updated.workload).toBe('20 h');
      expect(updated.updatedAt).not.toBe('2026-10-20T00:00:00.000Z');
      expect(jobs.save).toHaveBeenCalledWith(updated);
    });

    it('404 para vaga inexistente', async () => {
      const { service, jobs } = setup();
      jobs.findById.mockResolvedValue(null);
      await expect(service.update('x', { title: 'T' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('apaga as candidaturas da vaga antes da vaga', async () => {
      const { service, jobs, applications } = setup();
      applications.findByJob.mockResolvedValue([{ id: 'a1' }, { id: 'a2' }]);
      const order: string[] = [];
      applications.deleteMany.mockImplementation(() => {
        order.push('applications');
        return Promise.resolve();
      });
      jobs.delete.mockImplementation(() => {
        order.push('job');
        return Promise.resolve();
      });

      await service.remove('j1');

      expect(applications.deleteMany).toHaveBeenCalledWith(['a1', 'a2']);
      expect(order).toEqual(['applications', 'job']);
    });

    it('404 para vaga inexistente', async () => {
      const { service, jobs } = setup();
      jobs.findById.mockResolvedValue(null);
      await expect(service.remove('x')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
