import { ConflictException, NotFoundException } from '@nestjs/common';
import { LegalAdminService } from './legal-admin.service';
import {
  LegalAcceptance,
  LegalDocument,
  LegalDraft,
  LegalVersion,
} from './legal.model';
import { PublishWrite } from './legal.repository';

const manager = { sub: 'manager-1', email: 'm@x', role: 'manager' as const };

function header(overrides: Partial<LegalDocument> = {}): LegalDocument {
  return {
    type: 'terms-of-use',
    title: 'Termos de Uso',
    publishedVersion: '1.0',
    requiredVersion: '1.0',
    updatedAt: '2026-10-24T00:00:00.000Z',
    ...overrides,
  };
}

function published(overrides: Partial<LegalVersion> = {}): LegalVersion {
  return {
    type: 'terms-of-use',
    version: '1.0',
    title: 'Termos de Uso',
    markdown: 'Texto publicado',
    effectiveDate: '2026-10-24',
    requiresReacceptance: true,
    publishedAt: '2026-10-24T00:00:00.000Z',
    publishedBy: 'manager-1',
    ...overrides,
  };
}

function draft(overrides: Partial<LegalDraft> = {}): LegalDraft {
  return {
    type: 'terms-of-use',
    title: 'Termos de Uso',
    markdown: 'Texto novo',
    basedOnVersion: '1.0',
    updatedAt: '2026-10-25T00:00:00.000Z',
    updatedBy: 'manager-1',
    ...overrides,
  };
}

function acceptance(overrides: Partial<LegalAcceptance> = {}): LegalAcceptance {
  return {
    id: 'x',
    userId: 'aluno-1',
    role: 'student',
    type: 'terms-of-use',
    version: '1.0',
    acceptedAt: '2026-10-24T10:00:00.000Z',
    ip: '1.1.1.1',
    userAgent: 'ua',
    ...overrides,
  };
}

function setup() {
  let lastWrite: PublishWrite | null = null;
  const repository = {
    getDocument: jest.fn().mockResolvedValue(header()),
    getVersion: jest.fn().mockResolvedValue(published()),
    listVersions: jest.fn().mockResolvedValue([published()]),
    getDraft: jest.fn().mockResolvedValue(null),
    saveDraft: jest.fn().mockResolvedValue(undefined),
    deleteDraft: jest.fn().mockResolvedValue(undefined),
    publish: jest.fn(
      async (
        _type: string,
        build: (current: LegalDocument | null) => PublishWrite,
      ) => {
        lastWrite = build(await repository.getDocument());
        return lastWrite;
      },
    ),
    findAcceptancesByType: jest.fn().mockResolvedValue([]),
  };
  const users = {
    findAll: jest.fn((role: string) =>
      Promise.resolve(
        role === 'student'
          ? [{ id: 'aluno-1', fullName: 'Ana Aluna', role: 'student' }]
          : role === 'teacher'
            ? [{ id: 'prof-1', fullName: 'Paula Prof', role: 'teacher' }]
            : [{ id: 'manager-1', fullName: 'Gerente', role: 'manager' }],
      ),
    ),
  };
  const candidates = {
    findAll: jest
      .fn()
      .mockResolvedValue([{ id: 'cand-1', name: 'Carla Candidata' }]),
  };
  const service = new LegalAdminService(
    repository as any,
    users as any,
    candidates as any,
  );
  return {
    service,
    repository,
    users,
    candidates,
    written: () => lastWrite!,
  };
}

describe('LegalAdminService — rascunho (spec 029)', () => {
  it('sem rascunho, a edição começa da versão publicada (sem gravar nada)', async () => {
    const { service, repository } = setup();

    const result = await service.getDraft('terms-of-use');

    expect(result).toMatchObject({
      title: 'Termos de Uso',
      markdown: 'Texto publicado',
      basedOnVersion: '1.0',
      saved: false,
    });
    expect(repository.saveDraft).not.toHaveBeenCalled();
  });

  it('sem nada publicado, começa em branco com o título padrão', async () => {
    const { service, repository } = setup();
    repository.getDocument.mockResolvedValue(null);

    await expect(service.getDraft('privacy-policy')).resolves.toMatchObject({
      title: 'Política de Privacidade',
      markdown: '',
      basedOnVersion: null,
    });
  });

  it('rascunho salvo vem como está', async () => {
    const { service, repository } = setup();
    repository.getDraft.mockResolvedValue(draft());

    await expect(service.getDraft('terms-of-use')).resolves.toMatchObject({
      markdown: 'Texto novo',
      saved: true,
    });
  });

  it('salvar grava título, texto, autoria e de qual versão partiu', async () => {
    const { service, repository } = setup();

    await service.saveDraft(
      'terms-of-use',
      { title: ' Termos de Uso ', markdown: 'Novo' },
      manager,
    );

    expect(repository.saveDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'terms-of-use',
        title: 'Termos de Uso',
        markdown: 'Novo',
        basedOnVersion: '1.0',
        updatedBy: 'manager-1',
      }),
    );
  });

  it('descartar apaga o rascunho; tipo inválido é 404', async () => {
    const { service, repository } = setup();

    await service.discardDraft('terms-of-use');
    expect(repository.deleteDraft).toHaveBeenCalledWith('terms-of-use');

    await expect(service.discardDraft('contrato')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('LegalAdminService — publicação (spec 029)', () => {
  it('sem novo aceite: sobe a menor e mantém a versão exigida', async () => {
    const { service, repository, written } = setup();
    repository.getDraft.mockResolvedValue(draft());

    const result = await service.publish(
      'terms-of-use',
      {
        effectiveDate: '2026-10-25',
        requiresReacceptance: false,
        changeNote: 'Correção',
      },
      manager,
    );

    expect(result.version).toBe('1.1');
    expect(written().header).toMatchObject({
      publishedVersion: '1.1',
      requiredVersion: '1.0',
    });
    expect(written().version).toMatchObject({
      markdown: 'Texto novo',
      requiresReacceptance: false,
      changeNote: 'Correção',
      publishedBy: 'manager-1',
    });
  });

  it('com novo aceite: sobe a maior e passa a exigir essa versão', async () => {
    const { service, repository, written } = setup();
    repository.getDraft.mockResolvedValue(draft());

    await service.publish(
      'terms-of-use',
      { effectiveDate: '2026-10-25', requiresReacceptance: true },
      manager,
    );

    expect(written().header).toMatchObject({
      publishedVersion: '2.0',
      requiredVersion: '2.0',
    });
  });

  it('a primeira publicação é 1.0 e sempre exige aceite', async () => {
    const { service, repository, written } = setup();
    repository.getDocument.mockResolvedValue(null);
    repository.getDraft.mockResolvedValue(draft({ basedOnVersion: null }));

    await service.publish(
      'privacy-policy',
      { effectiveDate: '2026-10-25', requiresReacceptance: false },
      manager,
    );

    expect(written().version).toMatchObject({
      version: '1.0',
      requiresReacceptance: true,
    });
    expect(written().header.requiredVersion).toBe('1.0');
  });

  it('sem rascunho não há o que publicar (409)', async () => {
    const { service } = setup();

    await expect(
      service.publish(
        'terms-of-use',
        { effectiveDate: '2026-10-25', requiresReacceptance: false },
        manager,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rascunho com texto vazio não publica (409)', async () => {
    const { service, repository } = setup();
    repository.getDraft.mockResolvedValue(draft({ markdown: '   ' }));

    await expect(
      service.publish(
        'terms-of-use',
        { effectiveDate: '2026-10-25', requiresReacceptance: false },
        manager,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('LegalAdminService — resumo e aceites (spec 029)', () => {
  it('Termos de Uso: pendentes são todos os usuários e candidatos sem aceite da versão exigida', async () => {
    const { service, repository } = setup();
    repository.getDocument.mockResolvedValue(
      header({ publishedVersion: '2.1', requiredVersion: '2.0' }),
    );
    repository.findAcceptancesByType.mockResolvedValue([
      // aceitou a exigida: em dia
      acceptance({ userId: 'aluno-1', version: '2.0' }),
      // aceitou só a anterior: pendente
      acceptance({ userId: 'prof-1', role: 'teacher', version: '1.0' }),
    ]);

    const result = await service.getAcceptances('terms-of-use');

    expect(result.requiredVersion).toBe('2.0');
    expect(result.accepted.map((a) => a.userId)).toEqual(['aluno-1']);
    expect(result.accepted[0]).toMatchObject({
      name: 'Ana Aluna',
      version: '2.0',
    });
    expect(result.pending.map((p) => [p.userId, p.role]).sort()).toEqual([
      ['cand-1', 'candidate'],
      ['manager-1', 'manager'],
      ['prof-1', 'teacher'],
    ]);
  });

  it('termo do recrutamento: só candidatos contam', async () => {
    const { service, repository, users } = setup();
    repository.getDocument.mockResolvedValue(
      header({ type: 'recruitment', publishedVersion: '1.0' }),
    );

    const result = await service.getAcceptances('recruitment');

    expect(result.pending.map((p) => p.userId)).toEqual(['cand-1']);
    expect(users.findAll).not.toHaveBeenCalled();
  });

  it('sem versão publicada, ninguém está pendente', async () => {
    const { service, repository } = setup();
    repository.getDocument.mockResolvedValue(null);

    const result = await service.getAcceptances('privacy-policy');

    expect(result).toMatchObject({
      requiredVersion: null,
      pending: [],
      accepted: [],
    });
  });

  it('o resumo traz os três documentos, com rascunho e contagem de pendentes', async () => {
    const { service, repository } = setup();
    repository.getDocument.mockImplementation((type: string) =>
      Promise.resolve(
        type === 'recruitment' ? null : header({ type: type as any }),
      ),
    );
    repository.getDraft.mockImplementation((type: string) =>
      Promise.resolve(type === 'privacy-policy' ? draft() : null),
    );

    const overview = await service.overview();

    expect(overview.map((d) => d.type)).toEqual([
      'terms-of-use',
      'privacy-policy',
      'recruitment',
    ]);
    expect(overview[0]).toMatchObject({
      publishedVersion: '1.0',
      hasDraft: false,
      pendingCount: 4,
    });
    expect(overview[1].hasDraft).toBe(true);
    expect(overview[2]).toMatchObject({
      title:
        'Termo de Privacidade e Tratamento de Dados Pessoais — Processo Seletivo',
      publishedVersion: null,
      pendingCount: 0,
    });
  });
});
