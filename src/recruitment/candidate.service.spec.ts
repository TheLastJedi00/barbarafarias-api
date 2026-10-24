import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { CandidateService } from './candidate.service';
import { Candidate } from './candidate.model';

/** Versão do termo do recrutamento publicada no módulo legal (spec 029). */
const RECRUITMENT_TERMS_VERSION = '1.0';

function candidate(overrides: Partial<Candidate> = {}): Candidate {
  return {
    id: 'cand-1',
    email: 'ana@exemplo.com',
    name: 'Ana Souza',
    phone: '62999998888',
    consentAt: '2026-10-24T00:00:00.000Z',
    consentVersion: RECRUITMENT_TERMS_VERSION,
    createdAt: '2026-10-24T00:00:00.000Z',
    updatedAt: '2026-10-24T00:00:00.000Z',
    ...overrides,
  };
}

function setup() {
  const candidates = {
    findById: jest.fn().mockResolvedValue(candidate()),
    findAll: jest.fn().mockResolvedValue([]),
    save: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
  };
  const authService = {
    createAccount: jest.fn().mockResolvedValue(undefined),
    deleteAccount: jest.fn().mockResolvedValue(undefined),
  };
  const storage = {
    createUploadSession: jest.fn().mockResolvedValue('https://upload'),
    getObjectInfo: jest
      .fn()
      .mockResolvedValue({ size: 1000, contentType: 'application/pdf' }),
    signedReadUrl: jest.fn().mockResolvedValue('https://signed-read'),
    remove: jest.fn().mockResolvedValue(undefined),
    removePrefix: jest.fn().mockResolvedValue(undefined),
  };
  const applications = {
    findByCandidate: jest.fn().mockResolvedValue([]),
    deleteMany: jest.fn().mockResolvedValue(undefined),
  };
  const legal = {
    requirement: jest.fn().mockResolvedValue({
      publishedVersion: RECRUITMENT_TERMS_VERSION,
      requiredVersion: RECRUITMENT_TERMS_VERSION,
    }),
    accept: jest.fn().mockResolvedValue([]),
  };
  const service = new CandidateService(
    candidates as any,
    authService as any,
    storage as any,
    applications as any,
    legal as any,
  );
  return { service, candidates, authService, storage, applications, legal };
}

const signup = {
  email: 'ana@exemplo.com',
  password: 'senha-forte',
  name: 'Ana Souza',
  phone: '62999998888',
  acceptTerms: true as const,
  isAdult: true as const,
};

describe('CandidateService — cadastro (spec 028)', () => {
  it('cria a conta com papel candidate e o doc com o mesmo uid e o aceite do termo', async () => {
    const { service, candidates, authService } = setup();

    const view = await service.signup({
      ...signup,
      linkedinUrl: 'https://www.linkedin.com/in/ana',
    });

    const account = authService.createAccount.mock.calls[0][0];
    expect(account).toMatchObject({
      email: 'ana@exemplo.com',
      password: 'senha-forte',
      role: 'candidate',
    });
    expect(account.sendVerification).not.toBe(false);

    const saved: Candidate = candidates.save.mock.calls[0][0];
    expect(saved.id).toBe(account.uid);
    expect(saved).toMatchObject({
      email: 'ana@exemplo.com',
      name: 'Ana Souza',
      phone: '62999998888',
      linkedinUrl: 'https://www.linkedin.com/in/ana',
      consentVersion: RECRUITMENT_TERMS_VERSION,
    });
    expect(saved.consentAt).toBeTruthy();
    expect(saved).not.toHaveProperty('password');
    expect(view.needsConsent).toBe(false);
  });

  it('e-mail já usado: o 409 do createAccount sobe e nada é gravado', async () => {
    const { service, candidates, authService } = setup();
    authService.createAccount.mockRejectedValue(
      new ConflictException('E-mail já cadastrado'),
    );

    await expect(service.signup(signup)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(candidates.save).not.toHaveBeenCalled();
  });

  it('desfaz a conta no Firebase quando o doc não grava', async () => {
    const { service, candidates, authService } = setup();
    candidates.save.mockRejectedValue(new Error('firestore fora'));

    await expect(service.signup(signup)).rejects.toThrow('firestore fora');
    expect(authService.deleteAccount).toHaveBeenCalledWith(
      authService.createAccount.mock.calls[0][0].uid,
    );
  });
});

describe('CandidateService — meus dados (spec 028)', () => {
  it('devolve a visão sem caminhos do Storage, com a versão vigente do termo', async () => {
    const { service, candidates } = setup();
    candidates.findById.mockResolvedValue(
      candidate({
        resume: {
          storagePath: 'candidates/cand-1/resume-x.pdf',
          fileName: 'cv.pdf',
          mimeType: 'application/pdf',
          size: 1000,
          uploadedAt: '2026-10-24T00:00:00.000Z',
        },
        pendingResume: {
          storagePath: 'candidates/cand-1/resume-y.pdf',
          fileName: 'novo.pdf',
          mimeType: 'application/pdf',
          size: 1,
        },
      }),
    );

    const view = await service.getMe('cand-1');

    expect(candidates.findById).toHaveBeenCalledWith('cand-1');
    expect(view.resume).toEqual({
      fileName: 'cv.pdf',
      size: 1000,
      uploadedAt: '2026-10-24T00:00:00.000Z',
    });
    expect(view).not.toHaveProperty('pendingResume');
    expect(view.termsVersion).toBe(RECRUITMENT_TERMS_VERSION);
    expect(view.needsConsent).toBe(false);
  });

  it('aceite de versão anterior pede novo aceite', async () => {
    const { service, candidates } = setup();
    candidates.findById.mockResolvedValue(candidate({ consentVersion: '0.9' }));

    await expect(service.getMe('cand-1')).resolves.toMatchObject({
      needsConsent: true,
    });
  });

  it('404 quando o doc não existe', async () => {
    const { service, candidates } = setup();
    candidates.findById.mockResolvedValue(null);

    await expect(service.getMe('cand-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('edita nome, telefone e remove o LinkedIn com string vazia', async () => {
    const { service, candidates } = setup();
    candidates.findById.mockResolvedValue(
      candidate({ linkedinUrl: 'https://www.linkedin.com/in/ana' }),
    );

    const view = await service.updateMe('cand-1', {
      name: 'Ana S.',
      linkedinUrl: '',
    });

    const saved: Candidate = candidates.save.mock.calls[0][0];
    expect(saved.name).toBe('Ana S.');
    expect(saved.phone).toBe('62999998888');
    expect(saved).not.toHaveProperty('linkedinUrl');
    expect(saved.updatedAt).not.toBe('2026-10-24T00:00:00.000Z');
    expect(view.name).toBe('Ana S.');
  });

  it('novo aceite passa pelo módulo legal (prova + espelho no candidato)', async () => {
    const { service, legal } = setup();
    const meta = { ip: '1.1.1.1', userAgent: 'ua' };

    await service.acceptTerms('cand-1', { acceptTerms: true }, meta);

    expect(legal.accept).toHaveBeenCalledWith(
      expect.objectContaining({ sub: 'cand-1', role: 'candidate' }),
      ['recruitment'],
      meta,
    );
  });

  it('versão exigida mais nova que a aceita pede novo aceite (spec 029)', async () => {
    const { service, legal } = setup();
    legal.requirement.mockResolvedValue({
      publishedVersion: '2.1',
      requiredVersion: '2.0',
    });

    await expect(service.getMe('cand-1')).resolves.toMatchObject({
      termsVersion: '2.1',
      needsConsent: true,
    });
  });

  it('correção sem novo aceite (1.1) não incomoda quem aceitou a 1.0', async () => {
    const { service, legal } = setup();
    legal.requirement.mockResolvedValue({
      publishedVersion: '1.1',
      requiredVersion: '1.0',
    });

    await expect(service.getMe('cand-1')).resolves.toMatchObject({
      needsConsent: false,
    });
  });
});

describe('CandidateService — currículo (spec 028)', () => {
  const pdf = { fileName: 'cv.pdf', mimeType: 'application/pdf', size: 1000 };

  it('emite sessão de upload só para PDF, num caminho decidido aqui, e guarda o pendente', async () => {
    const { service, candidates, storage } = setup();

    const result = await service.requestResumeUpload(
      'cand-1',
      pdf,
      'https://front',
    );

    const [path, contentType, origin] =
      storage.createUploadSession.mock.calls[0];
    expect(path).toMatch(/^candidates\/cand-1\/resume-[\w-]+\.pdf$/);
    expect(contentType).toBe('application/pdf');
    expect(origin).toBe('https://front');
    expect(result).toEqual({ uploadUrl: 'https://upload' });
    const saved: Candidate = candidates.save.mock.calls[0][0];
    expect(saved.pendingResume).toEqual({ ...pdf, storagePath: path });
  });

  it('recusa tipo diferente de PDF e arquivo acima de 5 MB', async () => {
    const { service, storage } = setup();

    await expect(
      service.requestResumeUpload('cand-1', {
        ...pdf,
        mimeType: 'application/msword',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.requestResumeUpload('cand-1', {
        ...pdf,
        size: 5 * 1024 * 1024 + 1,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.createUploadSession).not.toHaveBeenCalled();
  });

  const pending = {
    storagePath: 'candidates/cand-1/resume-novo.pdf',
    fileName: 'novo.pdf',
    mimeType: 'application/pdf',
    size: 1000,
  };
  const current = {
    storagePath: 'candidates/cand-1/resume-velho.pdf',
    fileName: 'velho.pdf',
    mimeType: 'application/pdf',
    size: 900,
    uploadedAt: '2026-10-01T00:00:00.000Z',
  };

  it('confirma: o pendente vira o currículo, com o tamanho que chegou, e o antigo sai do Storage', async () => {
    const { service, candidates, storage } = setup();
    candidates.findById.mockResolvedValue(
      candidate({ resume: current, pendingResume: pending }),
    );
    storage.getObjectInfo.mockResolvedValue({
      size: 1200,
      contentType: 'application/pdf',
    });

    const view = await service.completeResumeUpload('cand-1');

    const saved: Candidate = candidates.save.mock.calls[0][0];
    expect(saved.resume).toMatchObject({
      storagePath: pending.storagePath,
      fileName: 'novo.pdf',
      size: 1200,
    });
    expect(saved.resume!.uploadedAt).toBeTruthy();
    expect(saved).not.toHaveProperty('pendingResume');
    expect(storage.remove).toHaveBeenCalledWith(current.storagePath);
    expect(view.resume!.fileName).toBe('novo.pdf');
  });

  it('confirmar sem sessão pendente é 409', async () => {
    const { service } = setup();
    await expect(service.completeResumeUpload('cand-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('objeto que não chegou ao bucket é 409 e mantém o pendente para nova tentativa', async () => {
    const { service, candidates, storage } = setup();
    candidates.findById.mockResolvedValue(
      candidate({ pendingResume: pending }),
    );
    storage.getObjectInfo.mockResolvedValue(null);

    await expect(service.completeResumeUpload('cand-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(candidates.save).not.toHaveBeenCalled();
  });

  it('o que chegou fora da regra (tipo ou tamanho) é apagado, e o currículo antigo fica', async () => {
    const { service, candidates, storage } = setup();
    candidates.findById.mockResolvedValue(
      candidate({ resume: current, pendingResume: pending }),
    );
    storage.getObjectInfo.mockResolvedValue({
      size: 6 * 1024 * 1024,
      contentType: 'application/pdf',
    });

    await expect(service.completeResumeUpload('cand-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(storage.remove).toHaveBeenCalledWith(pending.storagePath);
    const saved: Candidate = candidates.save.mock.calls[0][0];
    expect(saved.resume).toEqual(current);
    expect(saved).not.toHaveProperty('pendingResume');
  });

  it('download: URL assinada de 15 min com o nome original', async () => {
    const { service, candidates, storage } = setup();
    candidates.findById.mockResolvedValue(candidate({ resume: current }));

    await expect(service.resumeDownloadUrl('cand-1')).resolves.toEqual({
      url: 'https://signed-read',
    });
    expect(storage.signedReadUrl).toHaveBeenCalledWith(
      current.storagePath,
      15 * 60 * 1000,
      'velho.pdf',
    );
  });

  it('download sem currículo é 404', async () => {
    const { service } = setup();
    await expect(service.resumeDownloadUrl('cand-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('CandidateService — exclusão LGPD (spec 028)', () => {
  it('apaga candidaturas, arquivos, o doc e a conta, nessa ordem', async () => {
    const { service, applications, storage, candidates, authService } = setup();
    applications.findByCandidate.mockResolvedValue([
      { id: 'j1_cand-1' },
      { id: 'j2_cand-1' },
    ]);
    const order: string[] = [];
    applications.deleteMany.mockImplementation(() => {
      order.push('applications');
      return Promise.resolve();
    });
    storage.removePrefix.mockImplementation(() => {
      order.push('storage');
      return Promise.resolve();
    });
    candidates.delete.mockImplementation(() => {
      order.push('doc');
      return Promise.resolve();
    });
    authService.deleteAccount.mockImplementation(() => {
      order.push('account');
      return Promise.resolve();
    });

    await service.deleteAll('cand-1');

    expect(applications.deleteMany).toHaveBeenCalledWith([
      'j1_cand-1',
      'j2_cand-1',
    ]);
    expect(storage.removePrefix).toHaveBeenCalledWith('candidates/cand-1/');
    expect(candidates.delete).toHaveBeenCalledWith('cand-1');
    expect(authService.deleteAccount).toHaveBeenCalledWith('cand-1');
    expect(order).toEqual(['applications', 'storage', 'doc', 'account']);
  });

  it('pelo titular, termina mesmo sem o doc (pedido repetido apaga o que sobrou)', async () => {
    const { service, candidates, authService } = setup();
    candidates.findById.mockResolvedValue(null);

    await expect(service.deleteAll('cand-1')).resolves.toBeUndefined();
    expect(authService.deleteAccount).toHaveBeenCalledWith('cand-1');
  });

  it('pela gerente, candidato inexistente é 404 e nada é apagado', async () => {
    const { service, candidates, authService } = setup();
    candidates.findById.mockResolvedValue(null);

    await expect(service.deleteByManager('x')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(authService.deleteAccount).not.toHaveBeenCalled();
  });

  it('pela gerente, apaga tudo do candidato', async () => {
    const { service, authService } = setup();

    await service.deleteByManager('cand-1');

    expect(authService.deleteAccount).toHaveBeenCalledWith('cand-1');
  });
});
