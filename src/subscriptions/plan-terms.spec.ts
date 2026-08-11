// `@Type` do class-transformer lê metadados de decorator: sem este import a
// suíte quebra antes do primeiro `it`, e a mensagem não diz por quê.
import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { SEM_JUROS_CONFIRMADO, TERMS_VERSION, buildTerms } from './plan-terms';
import { ChoosePlanDto } from './dto/subscription.dto';
import { PLAN_CONFIGS } from './subscription.entity';

const ACEITE = { termsVersion: TERMS_VERSION, accepted: true };

async function erros(body: Record<string, unknown>) {
  const dto = plainToInstance(ChoosePlanDto, body);
  const resultado = await validate(dto);
  return resultado.flatMap((erro) => [
    erro.property,
    ...(erro.children ?? []).map((filho) => filho.property),
  ]);
}

describe('ChoosePlanDto — aceite obrigatório', () => {
  const base = { plan: 'ANNUAL', paymentMethod: 'CREDIT_CARD' };

  it('contratar sem aceite não passa da validação', async () => {
    // 400 **e nenhuma order criada**: o pipe barra antes de o service rodar,
    // então não há janela entre debitar R$ 2.280 e registrar que concordou.
    expect(await erros(base)).toContain('acceptance');
  });

  it('aceite com `accepted: false` também não passa', async () => {
    // `@Equals(true)` e não `@IsBoolean`: um `false` validado viraria um
    // registro afirmando que o aluno aceitou quando ele recusou.
    expect(
      await erros({ ...base, acceptance: { ...ACEITE, accepted: false } }),
    ).toContain('accepted');
  });

  it('aceite sem versão não passa', async () => {
    // Sem a versão, mudar o texto invalida o histórico inteiro.
    expect(await erros({ ...base, acceptance: { accepted: true } })).toContain(
      'termsVersion',
    );
  });

  it('aceite completo passa', async () => {
    expect(await erros({ ...base, acceptance: ACEITE })).toEqual([]);
  });
});

describe('buildTerms — o texto sai do catálogo', () => {
  it('os números do contrato são os do `PLAN_CONFIGS`, não digitados', () => {
    const anual = buildTerms('ANNUAL');
    const config = PLAN_CONFIGS.ANNUAL;

    const texto = [anual.summary, ...anual.clauses.map((c) => c.body)].join(
      ' ',
    );
    expect(texto).toContain('2.280');
    expect(texto).toContain(String(config.installments));
    expect(texto).toContain('190');
  });

  it('o parcelado explica que o débito é único e a divisão é do emissor', () => {
    const texto = buildTerms('SEMIANNUAL')
      .clauses.map((c) => c.body)
      .join(' ');

    // É a diferença entre o que o aluno vê ("6x de R$ 200") e o que acontece
    // no limite do cartão dele no mesmo instante.
    expect(texto).toMatch(/uma única cobrança/i);
    expect(texto).toMatch(/banco emissor/i);
  });

  it('todo plano diz que não há reembolso', () => {
    for (const plan of ['MONTHLY', 'SEMIANNUAL', 'ANNUAL'] as const) {
      const texto = buildTerms(plan)
        .clauses.map((c) => `${c.title} ${c.body}`)
        .join(' ');
      expect(texto).toMatch(/não são reembolsados/i);
    }
  });

  it('o mensal avisa da cobrança de validação que aparece e some', () => {
    const texto = buildTerms('MONTHLY')
      .clauses.map((c) => c.body)
      .join(' ');

    // Não é bug, mas é pergunta de suporte garantida se ninguém souber.
    expect(texto).toMatch(/estornada/i);
  });

  it('NÃO promete "sem juros" enquanto a conta não for conferida', () => {
    const texto = ['MONTHLY', 'SEMIANNUAL', 'ANNUAL']
      .flatMap((plan) => buildTerms(plan as any).clauses)
      .map((c) => `${c.title} ${c.body}`)
      .join(' ');

    // A frase só é verdadeira se o parcelamento sem acréscimo estiver ativo na
    // conta — **para 12 parcelas**, não só 6. É configuração de painel, fora do
    // código, invisível em diff: prometer antes de conferir é reclamação
    // garantida. Quando confirmarem, sobe-se a versão e acrescenta-se a frase.
    expect(SEM_JUROS_CONFIRMADO).toBe(false);
    expect(texto).not.toMatch(/sem juros|sem acréscimo/i);
  });

  it('carrega a versão, que é o que o aceite grava', () => {
    expect(buildTerms('ANNUAL').version).toBe(TERMS_VERSION);
  });
});
