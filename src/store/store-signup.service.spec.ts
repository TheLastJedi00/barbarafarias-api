import { ConflictException } from '@nestjs/common';
import { StoreSignupService } from './store-signup.service';

const dto = {
  email: 'lead@example.com',
  password: 'senha-forte-1',
  fullName: 'Lead Silva',
  phone: '11999998888',
  acceptTermsOfUse: true,
  acceptPrivacyPolicy: true,
};
const meta = { ip: '1.2.3.4', userAgent: 'jest' };

function setup() {
  const auth = {
    createAccount: jest.fn().mockResolvedValue(undefined),
    deleteAccount: jest.fn().mockResolvedValue(undefined),
  };
  const users = { save: jest.fn().mockResolvedValue('uid') };
  const legal = {
    requirement: jest.fn().mockResolvedValue({ publishedVersion: 'v1' }),
    accept: jest.fn().mockResolvedValue([]),
  };
  const service = new StoreSignupService(
    auth as any,
    users as any,
    legal as any,
  );
  return { service, auth, users, legal };
}

describe('StoreSignupService (spec 032 §6)', () => {
  it('cria aluno da loja: claim student, tier modules, sem plano, já com onboarding', async () => {
    const { service, auth, users } = setup();
    const res = await service.signup(dto, meta);

    const account = auth.createAccount.mock.calls[0][0];
    expect(account).toMatchObject({
      email: dto.email,
      password: dto.password,
      role: 'student',
    });
    // Verificação de e-mail: o padrão do createAccount é enviar.
    expect(account.sendVerification).not.toBe(false);

    const [user, uid] = users.save.mock.calls[0];
    expect(uid).toBe(account.uid);
    expect(res.id).toBe(account.uid);
    expect(user).toMatchObject({
      email: dto.email,
      fullName: dto.fullName,
      phone: dto.phone,
      role: 'student',
      tier: 'modules',
      isPaying: false,
      isTeacher: false,
    });
    // Sem `onboardedAt` o front prenderia o comprador na tela do convite.
    expect(user.onboardedAt).toEqual(expect.any(String));
    expect(user).not.toHaveProperty('password');
  });

  it('registra o aceite dos documentos publicados', async () => {
    const { service, legal, auth } = setup();
    await service.signup(dto, meta);
    const uid = auth.createAccount.mock.calls[0][0].uid;
    expect(legal.accept).toHaveBeenCalledWith(
      expect.objectContaining({ sub: uid, role: 'student' }),
      ['terms-of-use', 'privacy-policy'],
      meta,
    );
  });

  it('não chama o aceite quando nenhum documento foi publicado', async () => {
    const { service, legal } = setup();
    legal.requirement.mockResolvedValue({ publishedVersion: null });
    await service.signup(dto, meta);
    expect(legal.accept).not.toHaveBeenCalled();
  });

  it('desfaz a conta do Firebase se o perfil não gravar', async () => {
    const { service, auth, users } = setup();
    users.save.mockRejectedValue(new Error('firestore fora'));
    await expect(service.signup(dto, meta)).rejects.toThrow('firestore fora');
    expect(auth.deleteAccount).toHaveBeenCalledWith(
      auth.createAccount.mock.calls[0][0].uid,
    );
  });

  it('e-mail já usado propaga o 409 do createAccount', async () => {
    const { service, auth, users } = setup();
    auth.createAccount.mockRejectedValue(new ConflictException('em uso'));
    await expect(service.signup(dto, meta)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(users.save).not.toHaveBeenCalled();
  });
});
