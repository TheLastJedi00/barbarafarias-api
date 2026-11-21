import { TIER_TERMS_VERSION, buildTierTerms } from './plan-terms';
import { DEFAULT_TIERS } from '../plan-tiers/plan-tier.model';

/**
 * Minuta do contrato dos tiers (spec 035 §9/§10). O texto é da dona; o que se
 * trava aqui é que os números e as regras batem com o que o sistema faz.
 */
const PREMIUM = {
  ...DEFAULT_TIERS.private,
  active: true,
  packagePrice: 1800,
  monthlyPrice: 320,
};

function texto(terms: ReturnType<typeof buildTierTerms>): string {
  return [
    terms.summary,
    ...terms.clauses.map((c) => `${c.title} ${c.body}`),
  ].join('\n');
}

describe('buildTierTerms', () => {
  it('pacote: preço à vista, 6 meses, até 12x com juros do comprador', () => {
    const terms = buildTierTerms(PREMIUM, 'PACKAGE');
    const corpo = texto(terms);

    expect(terms.version).toBe(TIER_TERMS_VERSION);
    expect(terms.planLabel).toBe(
      'Consultoria Particular Premium — pacote de 6 meses',
    );
    expect(corpo).toMatch(/R\$\s?1\.800,00/);
    expect(corpo).toMatch(/6 meses/);
    expect(corpo).toMatch(/12 vezes/);
    expect(corpo).toMatch(/juros/i);
    expect(corpo).not.toMatch(/sem juros/i);
    expect(corpo).toMatch(/não pode ser cancelado/i);
  });

  it('assinatura: mensalidade, fidelidade de 6 meses e o que acontece fora da plataforma', () => {
    const corpo = texto(buildTierTerms(PREMIUM, 'SUBSCRIPTION'));

    expect(corpo).toMatch(/R\$\s?320,00/);
    expect(corpo).toMatch(/fidelidade de 6 meses/i);
    expect(corpo).toMatch(/sem multa/i);
    expect(corpo).toMatch(/próxima cobrança/i);
  });

  it('os dois: o que o tier inclui e a desistência em 7 dias do CDC', () => {
    for (const plan of ['PACKAGE', 'SUBSCRIPTION'] as const) {
      const corpo = texto(buildTierTerms(PREMIUM, plan));
      expect(corpo).toMatch(/professora dedicada/i);
      expect(corpo).toMatch(/vídeo aulas/i);
      expect(corpo).toMatch(/7 \(sete\) dias/);
      expect(corpo).toMatch(/art\. 49/);
    }
  });

  it('assinatura num tier sem mensalidade não tem contrato', () => {
    expect(() =>
      buildTierTerms({ ...PREMIUM, monthlyPrice: null }, 'SUBSCRIPTION'),
    ).toThrow();
  });
});
