import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { GATEWAY_PROVIDERS } from './payment.gateway';

/**
 * O legado morreu? (spec 023 Task 28)
 *
 * Enquanto os dois caminhos coexistirem no código há **dois jeitos de cobrar o
 * mesmo aluno** — e o segundo é o que ninguém está olhando. Um gateway antigo
 * sobrevive a uma migração do jeito mais discreto possível: um provider que
 * ninguém removeu do módulo, um handler de webhook ainda registrado, um
 * `import` que o `tsc` aceita porque o arquivo continua lá.
 *
 * Este teste varre **símbolos**, não prosa. Comentários podem — e devem —
 * continuar citando os provedores antigos: várias decisões desta integração só
 * fazem sentido contadas contra o que existia antes ("401 aqui, 400 lá, e por
 * quê"). Apagar essa memória para satisfazer um `grep` trocaria uma dívida por
 * outra pior.
 */

const SRC = join(__dirname, '..');

/**
 * Identificadores e variáveis de ambiente dos gateways removidos. São os nomes
 * que **executam** alguma coisa; nenhum deles pode existir em código vivo.
 */
const DEAD_SYMBOLS = [
  'StripeGateway',
  'StripeWebhookController',
  'StripeDomainEvent',
  'STRIPE_CLIENT',
  'STRIPE_API_VERSION',
  'createStripeClient',
  'handleStripeEvent',
  'stripeSubscriptionId',
  'stripeCustomerId',
  'setStripeCustomerId',
  'capSubscriptionCycles',
  'AbacatePayGateway',
  'AbacatePayCardGateway',
  'CHECKOUT_METHODS',
  'ABACATEPAY_API_KEY',
  'ABACATEPAY_WEBHOOK_SECRET',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET_INSTANTANEO',
  'STRIPE_WEBHOOK_SECRET_MINIMO',
];

/** Pacotes que saíram do `package.json` junto com as implementações. */
const DEAD_PACKAGES = ['stripe', 'abacatepay-nodejs-sdk'];

function typescriptFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return typescriptFiles(full);
    return full.endsWith('.ts') ? [full] : [];
  });
}

/** Tira comentários de linha e de bloco: só o código sobra. */
function codeOnly(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('Migração para o Mercado Pago — o legado morreu', () => {
  const files = typescriptFiles(SRC)
    // Este arquivo lista os nomes proibidos: incluí-lo na varredura o faria
    // acusar a si mesmo, para sempre.
    .filter((path) => basename(path) !== basename(__filename))
    .map((path) => ({ path, code: codeOnly(readFileSync(path, 'utf8')) }));

  it.each(DEAD_SYMBOLS)('nenhum código vivo cita `%s`', (symbol) => {
    const offenders = files
      .filter(({ code }) => code.includes(symbol))
      .map(({ path }) => path.slice(SRC.length + 1));

    expect(offenders).toEqual([]);
  });

  it('os SDKs dos gateways antigos saíram das dependências', () => {
    const pkg = JSON.parse(
      readFileSync(join(SRC, '..', 'package.json'), 'utf8'),
    ) as { dependencies: Record<string, string> };

    for (const dead of DEAD_PACKAGES) {
      expect(pkg.dependencies[dead]).toBeUndefined();
    }
  });

  it('sobra exatamente um provedor no catálogo', () => {
    // Um valor só — mas a **abstração fica**. O que saiu na migração foram as
    // implementações; as portas são justamente o que a tornou barata, e um
    // campo com um valor só é o que torna a próxima troca igual a esta.
    expect(Object.values(GATEWAY_PROVIDERS)).toEqual(['MERCADOPAGO']);
  });
});
