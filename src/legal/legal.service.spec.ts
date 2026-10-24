import { NotFoundException } from '@nestjs/common';
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
  const service = new LegalService(repository as any);
  return { service, repository };
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
