import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CandidateSignupDto, UpdateCandidateDto } from './candidate.dto';

async function errorsOf(cls: any, body: object): Promise<string[]> {
  const errors = await validate(plainToInstance(cls, body));
  return errors.map((error) => error.property).sort();
}

const valid = {
  email: 'ana@exemplo.com',
  password: 'senha-forte',
  name: 'Ana Souza',
  phone: '(62) 99999-8888',
  acceptTerms: true,
  isAdult: true,
};

describe('CandidateSignupDto (spec 028)', () => {
  it('aceita o cadastro mínimo e guarda o telefone só com dígitos', async () => {
    await expect(errorsOf(CandidateSignupDto, valid)).resolves.toEqual([]);
    const dto = plainToInstance(CandidateSignupDto, valid);
    expect(dto.phone).toBe('62999998888');
  });

  it('sem aceite do termo ou sem declarar 18+, recusa', async () => {
    await expect(
      errorsOf(CandidateSignupDto, { ...valid, acceptTerms: false }),
    ).resolves.toEqual(['acceptTerms']);
    await expect(
      errorsOf(CandidateSignupDto, { ...valid, isAdult: undefined }),
    ).resolves.toEqual(['isAdult']);
  });

  it('LinkedIn só com link completo do linkedin.com', async () => {
    await expect(
      errorsOf(CandidateSignupDto, {
        ...valid,
        linkedinUrl: 'https://www.linkedin.com/in/ana-souza',
      }),
    ).resolves.toEqual([]);
    await expect(
      errorsOf(CandidateSignupDto, {
        ...valid,
        linkedinUrl: 'https://evil.com/linkedin.com/in/x',
      }),
    ).resolves.toEqual(['linkedinUrl']);
    await expect(
      errorsOf(CandidateSignupDto, { ...valid, linkedinUrl: 'linkedin.com/in/x' }),
    ).resolves.toEqual(['linkedinUrl']);
  });

  it('recusa e-mail inválido, senha curta e telefone sem DDD', async () => {
    await expect(
      errorsOf(CandidateSignupDto, {
        ...valid,
        email: 'ana',
        password: '123',
        phone: '9999',
      }),
    ).resolves.toEqual(['email', 'password', 'phone']);
  });
});

describe('UpdateCandidateDto (spec 028)', () => {
  it('string vazia no LinkedIn é válida (remove o perfil)', async () => {
    await expect(
      errorsOf(UpdateCandidateDto, { linkedinUrl: '' }),
    ).resolves.toEqual([]);
  });

  it('nome em branco é recusado', async () => {
    await expect(errorsOf(UpdateCandidateDto, { name: '   ' })).resolves.toEqual([
      'name',
    ]);
  });
});
