import { ConflictException } from '@nestjs/common';
import { CandidateService } from './candidate.service';
import { Candidate, RECRUITMENT_TERMS_VERSION } from './candidate.model';

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
  const service = new CandidateService(
    candidates as any,
    authService as any,
    storage as any,
    applications as any,
  );
  return { service, candidates, authService, storage, applications };
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
