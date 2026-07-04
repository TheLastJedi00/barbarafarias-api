import { BcryptService } from './bcrypt.service';

describe('BcryptService', () => {
  const service = new BcryptService();

  it('gera um hash diferente da senha original', async () => {
    const hash = await service.transform('senha123');
    expect(hash).not.toBe('senha123');
    expect(hash.length).toBeGreaterThan(0);
  });

  it('valida a senha correta contra o hash', async () => {
    const hash = await service.transform('senha123');
    await expect(service.compare('senha123', hash)).resolves.toBe(true);
  });

  it('rejeita uma senha incorreta', async () => {
    const hash = await service.transform('senha123');
    await expect(service.compare('errada', hash)).resolves.toBe(false);
  });
});
