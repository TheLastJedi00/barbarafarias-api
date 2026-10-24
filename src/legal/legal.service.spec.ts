import { BadRequestException, NotFoundException } from '@nestjs/common';
import { LegalService } from './legal.service';
import { LegalDocument, LegalVersion } from './legal.model';

function header(overrides: Partial<LegalDocument> = {}): LegalDocument {
  return {
    type: 'terms-of-use',
    title: 'Termos de Uso',
    publishedVersion: '1.1',
    requiredVersion: '1.0',
    updatedAt: '2026-10-24T00:00:00.000Z',
    ...overrides,
  };
}

function version(overrides: Partial<LegalVersion> = {}): LegalVersion {
  return {
    type: 'terms-of-use',
    version: '1.0',
    title: 'Termos de Uso',
    markdown: 'Texto',
    effectiveDate: '2026-10-24',
    requiresReacceptance: true,
    publishedAt: '2026-10-24T00:00:00.000Z',
    publishedBy: 'manager-1',
    ...overrides,
  };
}

function legalSetup() {
  const repository = {
    getDocument: jest.fn().mockResolvedValue(header()),
    getVersion: jest.fn().mockResolvedValue(version({ version: '1.1' })),
    listVersions: jest.fn().mockResolvedValue([]),
    getDraft: jest.fn().mockResolvedValue(null),
    saveDraft: jest.fn().mockResolvedValue(undefined),
    deleteDraft: jest.fn().mockResolvedValue(undefined),
    publish: jest.fn(),
    findAcceptancesByUser: jest.fn().mockResolvedValue([]),
    findAcceptancesByType: jest.fn().mockResolvedValue([]),
    saveAcceptance: jest.fn().mockResolvedValue(undefined),
  };
  const candidates = {
    findById: jest
      .fn()
      .mockResolvedValue({ id: 'cand-1', consentAt: '', consentVersion: '' }),
    save: jest.fn().mockResolvedValue(undefined),
  };
  const service = new LegalService(repository as any, candidates as any);
  return { service, repository, candidates };
}

describe('LegalService — leitura pública (spec 029)', () => {
  it('a vigente é a versão publicada do cabeçalho', async () => {
    const { service, repository } = legalSetup();

    const current = await service.getCurrent('terms-of-use');

    expect(repository.getVersion).toHaveBeenCalledWith('terms-of-use', '1.1');
    expect(current.version).toBe('1.1');
  });

  it('tipo inválido é 404 sem tocar no banco', async () => {
    const { service, repository } = legalSetup();

    await expect(service.getCurrent('contrato')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(repository.getDocument).not.toHaveBeenCalled();
  });

  it('documento sem versão publicada é 404 — o rascunho nunca sai', async () => {
    const { service, repository } = legalSetup();
    repository.getDocument.mockResolvedValue(
      header({ publishedVersion: null }),
    );

    await expect(service.getCurrent('terms-of-use')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(repository.getDraft).not.toHaveBeenCalled();
  });

  it('lista as versões da mais nova para a mais antiga, sem o texto', async () => {
    const { service, repository } = legalSetup();
    repository.listVersions.mockResolvedValue([
      version({ version: '1.0' }),
      version({ version: '1.10', requiresReacceptance: false }),
      version({
        version: '1.9',
        requiresReacceptance: false,
        changeNote: 'Correção',
      }),
    ]);

    const list = await service.listVersions('terms-of-use');

    expect(list.map((v) => v.version)).toEqual(['1.10', '1.9', '1.0']);
    expect(list[0]).not.toHaveProperty('markdown');
    expect(list[1].changeNote).toBe('Correção');
  });

  it('versão exata, ou 404', async () => {
    const { service, repository } = legalSetup();
    await expect(
      service.getVersion('terms-of-use', '1.1'),
    ).resolves.toMatchObject({
      version: '1.1',
    });

    repository.getVersion.mockResolvedValue(null);
    await expect(
      service.getVersion('terms-of-use', '9.9'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

const aluno = { sub: 'aluno-1', email: 'a@x', role: 'student' as const };
const candidato = { sub: 'cand-1', email: 'c@x', role: 'candidate' as const };
const meta = { ip: '200.1.2.3', userAgent: 'Chrome' };

/** Cabeçalho publicado por tipo; `recruitment` só quando pedido. */
function publishedHeaders(
  overrides: Partial<Record<string, Partial<LegalDocument> | null>> = {},
) {
  return (type: string) =>
    Promise.resolve(
      type in overrides
        ? overrides[type] === null
          ? null
          : header({ type: type as any, ...overrides[type] })
        : header({
            type: type as any,
            publishedVersion: '1.0',
            requiredVersion: '1.0',
          }),
    );
}

describe('LegalService — pendências (spec 029)', () => {
  it('aluno sem aceite deve Termos de Uso e Política, nunca o do recrutamento', async () => {
    const { service, repository } = legalSetup();
    repository.getDocument.mockImplementation(publishedHeaders());

    const pending = await service.pending(aluno);

    expect(pending.map((p) => p.type)).toEqual([
      'terms-of-use',
      'privacy-policy',
    ]);
    expect(pending[0]).toMatchObject({
      version: '1.0',
      requiredVersion: '1.0',
    });
    expect(repository.findAcceptancesByUser).toHaveBeenCalledWith('aluno-1');
  });

  it('candidato deve os três', async () => {
    const { service, repository } = legalSetup();
    repository.getDocument.mockImplementation(publishedHeaders());

    const pending = await service.pending(candidato);

    expect(pending.map((p) => p.type)).toEqual([
      'terms-of-use',
      'privacy-policy',
      'recruitment',
    ]);
  });

  it('em dia com versão ≥ exigida; correção 1.1 não gera pendência', async () => {
    const { service, repository } = legalSetup();
    repository.getDocument.mockImplementation(
      publishedHeaders({
        'terms-of-use': { publishedVersion: '1.1', requiredVersion: '1.0' },
      }),
    );
    repository.findAcceptancesByUser.mockResolvedValue([
      { type: 'terms-of-use', version: '1.0' },
      { type: 'privacy-policy', version: '1.0' },
    ]);

    await expect(service.pending(aluno)).resolves.toEqual([]);
  });

  it('versão nova que exige aceite volta a pendurar quem aceitou a anterior', async () => {
    const { service, repository } = legalSetup();
    repository.getDocument.mockImplementation(
      publishedHeaders({
        'privacy-policy': { publishedVersion: '2.0', requiredVersion: '2.0' },
      }),
    );
    repository.findAcceptancesByUser.mockResolvedValue([
      { type: 'terms-of-use', version: '1.0' },
      { type: 'privacy-policy', version: '1.0' },
    ]);

    const pending = await service.pending(aluno);

    expect(pending.map((p) => [p.type, p.version])).toEqual([
      ['privacy-policy', '2.0'],
    ]);
  });

  it('documento sem versão publicada não gera pendência', async () => {
    const { service, repository } = legalSetup();
    repository.getDocument.mockImplementation(
      publishedHeaders({ 'terms-of-use': null, 'privacy-policy': null }),
    );

    await expect(service.pending(aluno)).resolves.toEqual([]);
  });
});

describe('LegalService — aceite (spec 029)', () => {
  it('grava a versão vigente — não uma escolhida pelo cliente — com IP e navegador', async () => {
    const { service, repository } = legalSetup();
    repository.getDocument.mockImplementation(
      publishedHeaders({
        'terms-of-use': { publishedVersion: '2.1', requiredVersion: '2.0' },
      }),
    );

    await service.accept(aluno, ['terms-of-use'], meta);

    expect(repository.saveAcceptance).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'aluno-1_terms-of-use_2.1',
        userId: 'aluno-1',
        role: 'student',
        type: 'terms-of-use',
        version: '2.1',
        ip: '200.1.2.3',
        userAgent: 'Chrome',
      }),
    );
  });

  it('devolve o que ainda falta depois do aceite', async () => {
    const { service, repository } = legalSetup();
    repository.getDocument.mockImplementation(publishedHeaders());
    repository.findAcceptancesByUser.mockResolvedValue([
      { type: 'terms-of-use', version: '1.0' },
    ]);

    const remaining = await service.accept(aluno, ['terms-of-use'], meta);

    expect(remaining.map((p) => p.type)).toEqual(['privacy-policy']);
  });

  it('tipo fora do papel é 400 (aluno não aceita o termo do recrutamento)', async () => {
    const { service, repository } = legalSetup();
    repository.getDocument.mockImplementation(publishedHeaders());

    await expect(
      service.accept(aluno, ['recruitment'], meta),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.saveAcceptance).not.toHaveBeenCalled();
  });

  it('documento não publicado é 400', async () => {
    const { service, repository } = legalSetup();
    repository.getDocument.mockImplementation(
      publishedHeaders({ 'terms-of-use': null }),
    );

    await expect(
      service.accept(aluno, ['terms-of-use'], meta),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('aceite do recrutamento pelo candidato espelha em candidates.consentVersion', async () => {
    const { service, repository, candidates } = legalSetup();
    repository.getDocument.mockImplementation(publishedHeaders());

    await service.accept(candidato, ['recruitment'], meta);

    expect(candidates.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'cand-1', consentVersion: '1.0' }),
    );
    expect(candidates.save.mock.calls[0][0].consentAt).toBeTruthy();
  });
});
