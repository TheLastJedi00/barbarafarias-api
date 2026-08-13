import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { RefreshDto } from './session.dto';

/**
 * O `ValidationPipe` global roda com `whitelist: true` **e**
 * `forbidNonWhitelisted: true`, e é isso que torna estes testes necessários: o
 * campo corta dos dois lados durante a transição da spec 021.
 */
describe('RefreshDto', () => {
  const validar = (body: unknown) =>
    validateSync(plainToInstance(RefreshDto, body), {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

  it('aceita corpo vazio — é como o front novo chama, com o token no cookie', () => {
    // Se o campo voltasse a ser obrigatório, isto viraria 400. E 400 escapa do
    // tratamento de 401 do interceptor, então o sintoma seria logout geral.
    expect(validar({})).toHaveLength(0);
  });

  it('aceita o token no corpo — é como o front antigo chama', () => {
    // O caminho de compatibilidade: enquanto a release anterior estiver no ar,
    // e na migração única do `bf.refresh` que já está no navegador das pessoas.
    expect(validar({ refresh_token: 'refresh-1' })).toHaveLength(0);
  });

  it('recusa um token que não é string', () => {
    expect(validar({ refresh_token: 123 })).not.toHaveLength(0);
  });
});
