import { REFRESH_COOKIE, SessionCookie } from './session-cookie';

describe('SessionCookie', () => {
  function build(devMode?: string) {
    const config = { get: jest.fn().mockReturnValue(devMode) };
    return new SessionCookie(config as any);
  }

  const makeRes = () => ({ cookie: jest.fn(), clearCookie: jest.fn() });

  it('grava o refresh token com os atributos que fecham o acesso do JavaScript', () => {
    const res = makeRes();
    build().set(res as any, 'refresh-1');

    const [nome, valor, options] = res.cookie.mock.calls[0];
    expect(nome).toBe(REFRESH_COOKIE);
    expect(valor).toBe('refresh-1');
    expect(options).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
      // Só as rotas de sessão precisam do cookie; em toda requisição ele seria
      // exposição sem ganho.
      path: '/auth',
    });
    // Host-only de propósito: com `domain` o cookie iria para qualquer
    // subdomínio, inclusive um futuro subdomínio de terceiro.
    expect(options.domain).toBeUndefined();
    expect(options.maxAge).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it('liga o Secure por padrão — o inseguro exige opt-in explícito', () => {
    // `DEV_MODE` ausente é o caso da produção (a Vercel não define a variável
    // por engano); o padrão precisa ser o seguro.
    const res = makeRes();
    build(undefined).set(res as any, 'refresh-1');

    expect(res.cookie.mock.calls[0][2].secure).toBe(true);
  });

  it('desliga o Secure só em DEV_MODE, por causa do Safari em http://localhost', () => {
    const res = makeRes();
    build('true').set(res as any, 'refresh-1');

    expect(res.cookie.mock.calls[0][2].secure).toBe(false);
  });

  it('limpa com exatamente os mesmos atributos com que gravou', () => {
    // O invariante que dá sentido a este arquivo existir: se `clearCookie`
    // divergir em `path`, `sameSite`, `secure` ou `httpOnly`, o navegador não
    // casa os dois e o cookie **sobrevive ao logout** — a pessoa vê a tela de
    // login e acha que saiu.
    const res = makeRes();
    const cookie = build();

    cookie.set(res as any, 'refresh-1');
    cookie.clear(res as any);

    const { maxAge, ...gravado } = res.cookie.mock.calls[0][2];
    const [nome, limpado] = res.clearCookie.mock.calls[0];
    expect(nome).toBe(REFRESH_COOKIE);
    expect(limpado).toEqual(gravado);
  });

  it('lê o token do cookie da requisição', () => {
    const cookie = build();

    expect(cookie.read({ cookies: { [REFRESH_COOKIE]: 'refresh-1' } } as any)).toBe(
      'refresh-1',
    );
  });

  it('devolve indefinido quando não há cookie na requisição', () => {
    // Requisição sem `cookie-parser` (teste, ferramenta externa) não pode
    // explodir: quem decide o que fazer com a ausência é o controller.
    const cookie = build();

    expect(cookie.read({} as any)).toBeUndefined();
    expect(cookie.read({ cookies: {} } as any)).toBeUndefined();
  });
});
