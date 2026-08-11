import {
  GATEWAY_FEE_RATE,
  PLAN_CONFIGS,
  netOfGatewayFee,
} from './subscription.entity';

/**
 * O catálogo tem que fechar consigo mesmo (spec 023, reajuste de 11/08/2026).
 *
 * Cada plano carrega agora **três** dinheiros que andam juntos e significam
 * coisas diferentes: o que cobramos, o que a aluna paga com os juros do
 * Mercado Pago, e o que sobra para a gerente. Colapsá-los num só foi o que a
 * spec inteira veio desfazer, e um número digitado errado aqui não quebra
 * nada — só cobra o valor errado, caladinho.
 *
 * O reajuste chegou justamente porque o parcelamento sem juros (T3) não vai
 * acontecer: quem financia é o provedor, e o preço de tabela passou a ser o
 * valor com juros.
 */
describe('Catálogo de planos', () => {
  const planos = Object.values(PLAN_CONFIGS);

  it.each(planos)('$label: a parcela do plano fecha a base', (config) => {
    // `installmentAmount` é a fatia que vai para `charges[].amount`, e é o que
    // o painel financeiro soma por competência.
    expect(config.installmentAmount * config.installments).toBeCloseTo(
      config.totalAmount,
      2,
    );
  });

  it.each(planos)('$label: a parcela do pagador fecha o total', (config) => {
    // Até um centavo de folga: o provedor arredonda a parcela, e no Anual
    // 12 × 219,80 dá dois centavos a mais que o total cobrado. Exigir igualdade
    // exata obrigaria a mentir num dos dois números.
    const somaDasParcelas = config.payerInstallment * config.installments;
    expect(Math.abs(somaDasParcelas - config.payerTotal)).toBeLessThanOrEqual(
      config.installments * 0.01,
    );
  });

  it.each(planos)('$label: o pagador nunca paga menos que a base', (config) => {
    // Juros do comprador só somam. Um `payerTotal` abaixo da base seria
    // desconto disfarçado — e foi exatamente o sintoma que denunciou um
    // dígito trocado quando estes preços chegaram.
    expect(config.payerTotal).toBeGreaterThanOrEqual(config.totalAmount);
  });

  it('à vista não tem juros: no mensal os três valores coincidem', () => {
    const mensal = PLAN_CONFIGS.MONTHLY;
    expect(mensal.payerTotal).toBe(mensal.totalAmount);
    expect(mensal.payerInstallment).toBe(mensal.installmentAmount);
  });

  it('a taxa do gateway reproduz os valores informados pela dona', () => {
    // A régua não é chute: ela nasceu destes dois números, e é o que permite
    // responder pelo mensal, que não veio na conta.
    expect(netOfGatewayFee(1200)).toBe(1140.24);
    expect(netOfGatewayFee(2160)).toBe(2052.43);
    expect(GATEWAY_FEE_RATE).toBeLessThan(0.1);
  });

  it('o líquido sai do que cobramos, não do que a aluna paga', () => {
    // Os juros do comprador ficam com o provedor: entram no valor dela e não
    // chegam aqui. Aplicar a taxa sobre o total do pagador inflaria o
    // faturamento em quase 500 reais no Anual.
    const anual = PLAN_CONFIGS.ANNUAL;
    expect(netOfGatewayFee(anual.totalAmount)).toBeLessThan(anual.totalAmount);
    expect(netOfGatewayFee(anual.totalAmount)).toBeLessThan(anual.payerTotal);
  });
});
