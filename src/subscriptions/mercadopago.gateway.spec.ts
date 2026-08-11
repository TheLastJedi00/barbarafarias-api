import { createHmac } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import {
  GatewayConflictError,
  MercadoPagoGateway,
  idempotencyKeyFor,
  payerOf,
  readPixCodes,
  toDataUri,
  toAmountString,
  toIsoDuration,
} from './mercadopago.gateway';
import type { MercadoPagoClients } from './mercadopago.gateway';
import { PLAN_CONFIGS } from './subscription.entity';
import {
  MPBadRequestError,
  MPIdempotencyError,
} from 'mercadopago/dist/utils/errors';

/**
 * Esta suíte não testa cobertura de linha: testa a **falha silenciosa**.
 *
 * Em cobrança o modo de falha que importa não é o erro — é o silêncio. O
 * sistema responde 200, a tela diz "pagamento concluído", e o dinheiro está
 * errado. Cada `it` abaixo corresponde a uma linha do catálogo da spec, e a
 * maioria é uma assertiva **negativa**: "aqui não vai X". São elas que quebram
 * quando alguém "melhora" o gateway sem ler o comentário.
 */

/** Cliente de mentira: **nenhuma suíte deste projeto toca a rede**. */
function fakeClients() {
  const orders = {
    create: jest.fn().mockResolvedValue({
      id: 'ORD01ABC',
      status: 'processed',
      status_detail: 'accredited',
    }),
    get: jest.fn(),
  };
  const subscriptions = {
    create: jest.fn().mockResolvedValue({ id: 'preapproval_1' }),
    update: jest.fn().mockResolvedValue({}),
    get: jest.fn(),
  };
  return {
    orders,
    subscriptions,
    subscriptionsToken: 'TEST-token',
  } as unknown as MercadoPagoClients & {
    orders: { create: jest.Mock; get: jest.Mock };
    subscriptions: { create: jest.Mock; update: jest.Mock; get: jest.Mock };
  };
}

const SECRET = 'segredo-do-painel';

function build(env: Record<string, string> = {}) {
  const clients = fakeClients();
  const config = {
    get: (key: string) =>
      ({ MP_WEBHOOK_SECRET: SECRET, APP_BASE_URL: 'https://app', ...env })[key],
  } as ConfigService;
  return { clients, gateway: new MercadoPagoGateway(clients, config) };
}

const CLIENTE = { email: 'ana@example.com', name: 'Ana', taxId: '390' };
const CARTAO = { token: 'tok_1', paymentMethodId: 'master' };

function pedidoDeCartao(plan: 'SEMIANNUAL' | 'ANNUAL' | 'MONTHLY') {
  const config = PLAN_CONFIGS[plan];
  return {
    amount: config.recurring ? config.installmentAmount : config.totalAmount,
    description: `${config.label} — parcela 1`,
    externalId: `aluno-1-1-${config.totalAmount * 100}`,
    customer: CLIENTE,
    product: { key: plan, label: `Plano ${config.label}` },
    plan,
    planLabel: `Plano ${config.label}`,
    studentId: 'aluno-1',
    chargeIndex: 1,
    installments: config.installments,
    recurring: { cycles: config.recurring ? null : config.installments },
    card: CARTAO,
  };
}

describe('MercadoPagoGateway — sem chave', () => {
  it('nasce desligado em vez de derrubar o boot', () => {
    const config = { get: () => undefined } as unknown as ConfigService;

    // Chave ausente **não** é exceção de boot: o aluno vê o plano gravado com
    // um aviso, em vez de um 500 sem explicação.
    expect(new MercadoPagoGateway(null, config).isEnabled()).toBe(false);
  });
});

describe('MercadoPagoGateway — cartão parcelado', () => {
  it('o anual vai em 12x, e o número sai do catálogo', async () => {
    const { gateway, clients } = build();

    await gateway.createCheckout(pedidoDeCartao('ANNUAL') as any);

    const { body } = clients.orders.create.mock.calls[0][0];
    const pagamento = body.transactions.payments[0];
    // Sem isto o aluno é debitado à vista em R$ 2.280 — a falha silenciosa
    // número 1 do catálogo, e o bug que originou esta spec.
    expect(pagamento.payment_method.installments).toBe(12);
    expect(pagamento.payment_method.type).toBe('credit_card');
    expect(pagamento.payment_method.token).toBe('tok_1');
  });

  it('o total enviado é exatamente o do catálogo, como string', async () => {
    const { gateway, clients } = build();

    await gateway.createCheckout(pedidoDeCartao('SEMIANNUAL') as any);

    const { body } = clients.orders.create.mock.calls[0][0];
    // String com duas casas: `1200` ou `1200.0` é o tipo de divergência que
    // some no JSON e reaparece no extrato.
    expect(body.total_amount).toBe('1200.00');
    expect(body.transactions.payments[0].amount).toBe('1200.00');
    expect(body.processing_mode).toBe('automatic');
  });

  it('recusa cobrar sem token, em vez de mandar `undefined` para a API', async () => {
    const { gateway } = build();
    const pedido = { ...pedidoDeCartao('ANNUAL'), card: undefined };

    await expect(gateway.createCheckout(pedido as any)).rejects.toThrow(
      /sem token/,
    );
  });

  it('recusa cobrar sem número de parcelas válido', async () => {
    const { gateway } = build();
    const pedido = { ...pedidoDeCartao('ANNUAL'), installments: 0 };

    await expect(gateway.createCheckout(pedido as any)).rejects.toThrow(
      /parcelas/,
    );
  });

  it('manda `X-Idempotency-Key`, e a mesma cobrança gera a mesma chave', async () => {
    const { gateway, clients } = build();

    await gateway.createCheckout(pedidoDeCartao('ANNUAL') as any);
    await gateway.createCheckout(pedidoDeCartao('ANNUAL') as any);

    const [primeira, segunda] = clients.orders.create.mock.calls.map(
      (call: any[]) => call[0].requestOptions.idempotencyKey,
    );
    // **Estável, não sorteada.** Uma chave nova a cada chamada tem o formato
    // certo e não protege de nada: dois cliques virariam duas cobranças.
    expect(primeira).toBe(segunda);
    expect(primeira).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('cobranças diferentes têm chaves diferentes', () => {
    expect(idempotencyKeyFor('aluno-1-1-228000')).not.toBe(
      idempotencyKeyFor('aluno-1-2-228000'),
    );
  });

  it('token novo gera chave nova: uma tentativa não trava a seguinte', async () => {
    const { gateway, clients } = build();

    await gateway.createCheckout(pedidoDeCartao('ANNUAL') as any);
    await gateway.createCheckout({
      ...pedidoDeCartao('ANNUAL'),
      card: { token: 'tok_2', paymentMethodId: 'master' },
    } as any);

    const [primeira, segunda] = clients.orders.create.mock.calls.map(
      (call: any[]) => call[0].requestOptions.idempotencyKey,
    );
    // **Estável na tentativa, não na cobrança.** Derivar só do id da cobrança
    // torna a chave eterna: uma primeira tentativa recusada por payload
    // inválido queima a chave, e a correção do payload passa a bater em 409 —
    // a cobrança fica permanentemente bloqueada. Foi o que aconteceu em
    // ambiente de teste.
    expect(primeira).not.toBe(segunda);
  });

  it('409 vira erro nomeado, não "MercadoPago API error"', async () => {
    const { gateway, clients } = build();
    clients.orders.create.mockRejectedValue(
      new MPIdempotencyError({ status: 409, message: 'MercadoPago API error' }),
    );
    jest
      .spyOn((gateway as any).logger, 'error')
      .mockImplementation(() => undefined);

    // A saída é específica — reenviar o formulário emite outro token —, e o
    // aluno só descobre isso se alguém disser.
    await expect(
      gateway.createCheckout(pedidoDeCartao('ANNUAL') as any),
    ).rejects.toThrow(GatewayConflictError);
  });

  it('liga o 3DS com liability shift', async () => {
    const { gateway, clients } = build();

    await gateway.createCheckout(pedidoDeCartao('ANNUAL') as any);

    const { body } = clients.orders.create.mock.calls[0][0];
    expect(body.config.online.transaction_security).toEqual({
      validation: 'on_fraud_risk',
      liability_shift: 'required',
    });
  });

  it('desafio 3DS volta como CHALLENGE, não como sucesso', async () => {
    const { gateway, clients } = build();
    clients.orders.create.mockResolvedValue({
      id: 'ORD01ABC',
      status: 'action_required',
      status_detail: 'pending_challenge',
      transactions: {
        payments: [
          {
            payment_method: {
              transaction_security: { url: 'https://mp/challenge' },
            },
          },
        ],
      },
    });

    const result = await gateway.createCheckout(
      pedidoDeCartao('ANNUAL') as any,
    );

    // Tratar isto como concluído deixa o aluno debitado, a tela dizendo
    // "concluído" e a cobrança nunca completando.
    expect(result.outcome).toBe('CHALLENGE');
    expect(result.challengeUrl).toBe('https://mp/challenge');
  });

  it('status desconhecido recusa, nunca aprova', async () => {
    const { gateway, clients } = build();
    clients.orders.create.mockResolvedValue({
      id: 'ORD01ABC',
      status: 'algo_que_o_mercado_pago_inventou_amanha',
    });

    // Regra 4 da bateria: "não reconheci" e "está pago" são vizinhos perigosos
    // demais. O desfecho seguro é a recusa.
    const result = await gateway.createCheckout(
      pedidoDeCartao('ANNUAL') as any,
    );
    expect(result.outcome).toBe('REJECTED');
  });

  it('`processed` sem `accredited` não é pagamento', async () => {
    const { gateway, clients } = build();
    clients.orders.create.mockResolvedValue({
      id: 'ORD01ABC',
      status: 'processed',
      status_detail: 'partially_refunded',
    });

    const result = await gateway.createCheckout(
      pedidoDeCartao('ANNUAL') as any,
    );
    expect(result.outcome).not.toBe('PAID');
  });
});

describe('MercadoPagoGateway — o pagador', () => {
  it('manda o CPF: sem ele a Orders API recusa o cartão com 400', async () => {
    const { gateway, clients } = build();

    await gateway.createCheckout(pedidoDeCartao('ANNUAL') as any);

    const { body } = clients.orders.create.mock.calls[0][0];
    // Foi encontrado em ambiente de teste: `payer` só com e-mail devolve 400.
    // O "Documento do titular" que o formulário coleta não adiantava nada se
    // parasse no navegador.
    expect(body.payer.identification).toEqual({
      type: 'CPF',
      number: '390',
    });
  });

  it('o CPF vai só com dígitos, sem a máscara da tela', () => {
    expect(payerOf({ email: 'a@b.c', taxId: '390.533.447-05' })).toMatchObject({
      identification: { type: 'CPF', number: '39053344705' },
    });
  });

  it('separa nome e sobrenome, que a antifraude usa', () => {
    expect(payerOf({ email: 'a@b.c', name: 'Ana Maria Aluna' })).toMatchObject({
      first_name: 'Ana',
      last_name: 'Maria Aluna',
    });
  });

  it('sem documento, o campo some em vez de ir vazio', () => {
    // Um `identification: { type: 'CPF', number: '' }` é pior que ausência: a
    // API o rejeita com uma mensagem sobre formato, não sobre falta.
    const payer = payerOf({ email: 'a@b.c' });
    expect(payer).toEqual({ email: 'a@b.c' });
  });

  it('o PIX manda o mesmo pagador do cartão', async () => {
    const { gateway, clients } = build();
    clients.orders.create.mockResolvedValue({
      id: 'ORD01PIX',
      transactions: {
        payments: [{ payment_method: { qr_code: 'x', qr_code_base64: 'y' } }],
      },
    });

    await gateway.createPixCharge({
      amount: 240,
      description: 'Mensal — parcela 1',
      externalId: 'aluno-1-1-24000',
      customer: CLIENTE,
    });

    const { body } = clients.orders.create.mock.calls[0][0];
    expect(body.payer.identification).toBeDefined();
  });
});

describe('MercadoPagoGateway — o que a antifraude precisa', () => {
  it('manda um item com título, descrição, categoria e preço', async () => {
    const { gateway, clients } = build();

    await gateway.createCheckout(pedidoDeCartao('ANNUAL') as any);

    const { body } = clients.orders.create.mock.calls[0][0];
    // O checklist do provedor cobra `items` como obrigatório, e não é
    // burocracia: é o que a antifraude lê para decidir entre aprovar, pedir
    // desafio 3DS e recusar. Recusa indevida é venda perdida sem log nenhum.
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({
      title: 'Plano Anual',
      category_id: 'learnings',
      quantity: 1,
      unit_price: '2280.00',
    });
  });

  it('o item é UM, pelo total — não doze de R$ 190', async () => {
    const { gateway, clients } = build();

    await gateway.createCheckout(pedidoDeCartao('ANNUAL') as any);

    const [item] = clients.orders.create.mock.calls[0][0].body.items;
    // Quem divide é o emissor. Descrever "12 unidades" diria ao provedor uma
    // coisa que não é verdade, e ainda desalinharia item e `total_amount`.
    expect(item.quantity).toBe(1);
    expect(item.unit_price).toBe('2280.00');
  });

  it('manda o descritor que aparece na fatura', async () => {
    const { gateway, clients } = build();

    await gateway.createCheckout(pedidoDeCartao('ANNUAL') as any);

    // Nome irreconhecível na fatura de um débito de R$ 2.280 sem reembolso é o
    // roteiro do "não fui eu".
    expect(clients.orders.create.mock.calls[0][0].body.config).toMatchObject({
      statement_descriptor: 'BFARIAS',
    });
  });

  it('manda o telefone com DDD separado', () => {
    expect(
      payerOf({ email: 'a@b.c', cellphone: '(11) 98888-7777' }),
    ).toMatchObject({ phone: { area_code: '11', number: '988887777' } });
  });

  it('telefone incompleto some, em vez de ir pela metade', () => {
    const payer = payerOf({ email: 'a@b.c', cellphone: '9999' });
    expect(payer.phone).toBeUndefined();
  });

  it('o PIX também leva item e descritor', async () => {
    const { gateway, clients } = build();
    clients.orders.create.mockResolvedValue({
      id: 'ORD01PIX',
      transactions: {
        payments: [{ payment_method: { qr_code: 'x', qr_code_base64: 'y' } }],
      },
    });

    await gateway.createPixCharge({
      amount: 240,
      description: 'Mensal — parcela 1',
      externalId: 'aluno-1-1-24000',
      customer: CLIENTE,
      product: { key: 'MONTHLY', label: 'Plano Mensal' },
    });

    const { body } = clients.orders.create.mock.calls[0][0];
    expect(body.items[0].title).toBe('Plano Mensal');
    expect(body.config.statement_descriptor).toBe('BFARIAS');
  });
});

describe('MercadoPagoGateway — o que o log conta', () => {
  it('registra o pedido, já que a resposta do provedor se perde', async () => {
    const { gateway, clients } = build();
    clients.orders.create.mockRejectedValue(
      new MPBadRequestError({ status: 400, message: 'MercadoPago API error' }),
    );
    const log = jest
      .spyOn((gateway as any).logger, 'error')
      .mockImplementation(() => undefined);

    await expect(
      gateway.createCheckout(pedidoDeCartao('ANNUAL') as any),
    ).rejects.toBeDefined();

    // O SDK monta o erro de `message`/`error`/`cause`; a Orders API responde em
    // `errors[].details`, que ele descarta. Sem o pedido ao lado, um 400 exige
    // reproduzir a chamada à mão — foi o que custou uma rodada de teste.
    const linha = log.mock.calls[0][0] as string;
    expect(linha).toContain('valor=2280.00');
    expect(linha).toContain('parcelas=12');
    expect(linha).toContain('emailDominio=example.com');
    expect(linha).toContain('doc=3 dígitos');
  });

  it('o log não carrega e-mail inteiro, documento nem cartão', async () => {
    const { gateway, clients } = build();
    clients.orders.create.mockRejectedValue(
      new MPBadRequestError({ status: 400, message: 'x' }),
    );
    const log = jest
      .spyOn((gateway as any).logger, 'error')
      .mockImplementation(() => undefined);

    await expect(
      gateway.createCheckout(pedidoDeCartao('ANNUAL') as any),
    ).rejects.toBeDefined();

    const linha = log.mock.calls[0][0] as string;
    // Diagnóstico não justifica derramar dado pessoal nem credencial de
    // pagamento no log: o domínio responde a pergunta do ambiente, e o
    // tamanho do documento responde a de formato.
    expect(linha).not.toContain('ana@example.com');
    expect(linha).not.toContain('tok_1');
    expect(linha).not.toMatch(/\b390\b/);
  });
});

describe('MercadoPagoGateway — diagnóstico de recusa', () => {
  it('loga status e causas antes de repassar o erro', async () => {
    const { gateway, clients } = build();
    const erro = new MPBadRequestError({
      status: 400,
      message: 'MercadoPago API error',
      error: 'bad_request',
      cause: [{ code: 2067, description: 'payer.identification invalid' }],
    });
    clients.orders.create.mockRejectedValue(erro);
    const log = jest
      .spyOn((gateway as any).logger, 'error')
      .mockImplementation(() => undefined);

    await expect(
      gateway.createCheckout(pedidoDeCartao('ANNUAL') as any),
    ).rejects.toBe(erro);

    // Sem isto, a recusa chega ao filtro global como "MercadoPago API error" —
    // uma frase que não diz nada — e o backend não registra pista nenhuma.
    // Regra 3 da bateria: nenhum caminho de falha termina sem sinal.
    const registrado = log.mock.calls[0][0] as string;
    expect(registrado).toContain('400');
    expect(registrado).toContain('payer.identification invalid');
  });
});

describe('MercadoPagoGateway — plano mensal', () => {
  it('abre assinatura recorrente com o token do cartão', async () => {
    const { gateway, clients } = build();

    const result = await gateway.createCheckout(
      pedidoDeCartao('MONTHLY') as any,
    );

    const { body } = clients.subscriptions.create.mock.calls[0][0];
    expect(body.status).toBe('authorized');
    expect(body.card_token_id).toBe('tok_1');
    expect(body.auto_recurring).toMatchObject({
      frequency: 1,
      frequency_type: 'months',
      transaction_amount: 240,
      currency_id: 'BRL',
    });
    expect(result.subscriptionId).toBe('preapproval_1');
  });

  it('manda um `back_url` público, nunca localhost', async () => {
    const { gateway, clients } = build();

    await gateway.createCheckout(pedidoDeCartao('MONTHLY') as any);

    // O campo é **obrigatório** pela API e **nunca usado** por nós: serve ao
    // redirecionamento que a spec 014 proibiu. Derivá-lo de `APP_BASE_URL`
    // punha `localhost` no corpo, que o provedor recusa — e tornava o plano
    // mensal intestável na máquina por causa de um destino que ninguém visita.
    const { body } = clients.subscriptions.create.mock.calls[0][0];
    expect(body.back_url).toBe('https://barbarafarias.com.br/meu-plano');
    expect(body.back_url).not.toContain('localhost');
  });

  it('criar a assinatura NÃO é ter recebido', async () => {
    const { gateway } = build();

    const result = await gateway.createCheckout(
      pedidoDeCartao('MONTHLY') as any,
    );

    // A primeira cobrança sai em até ~1h. `PAID` aqui liberaria acesso antes
    // de existir dinheiro — e para sempre, se a cobrança falhar.
    expect(result.outcome).toBe('PENDING');
  });

  it('não usa `repetitions` para fechar plano de prazo fixo', async () => {
    const { gateway, clients } = build();

    await gateway.createCheckout(pedidoDeCartao('SEMIANNUAL') as any);

    // Fechar o semestral em 6 ciclos seria 6 cobranças que podem falhar na
    // quarta: o bug de origem desta spec, reencenado com outro sotaque.
    expect(clients.subscriptions.create).not.toHaveBeenCalled();
    expect(clients.orders.create).toHaveBeenCalledTimes(1);
  });

  it('cancelar é um PUT de status, e já cancelada não é erro', async () => {
    const { gateway, clients } = build();

    await gateway.cancelSubscription('preapproval_1');

    expect(clients.subscriptions.update).toHaveBeenCalledWith({
      id: 'preapproval_1',
      body: { status: 'cancelled' },
    });
  });
});

describe('MercadoPagoGateway — PIX', () => {
  const PEDIDO_PIX = {
    amount: 240,
    description: 'Mensal — parcela 1',
    externalId: 'aluno-1-1-24000',
    customer: CLIENTE,
  };

  function ordemComQr() {
    return {
      id: 'ORD01PIX',
      status: 'action_required',
      status_detail: 'waiting_transfer',
      transactions: {
        payments: [
          {
            payment_method: {
              id: 'pix',
              type: 'bank_transfer',
              qr_code: '00020126580014br.gov.bcb.pix...',
              qr_code_base64: 'iVBORw0KGgo=',
            },
          },
        ],
      },
    };
  }

  it('manda os dois campos do meio de pagamento', async () => {
    const { gateway, clients } = build();
    clients.orders.create.mockResolvedValue(ordemComQr());

    await gateway.createPixCharge(PEDIDO_PIX);

    const { body } = clients.orders.create.mock.calls[0][0];
    expect(body.transactions.payments[0].payment_method).toEqual({
      id: 'pix',
      type: 'bank_transfer',
    });
  });

  it('a validade vai como duração ISO 8601, não como segundos', async () => {
    const { gateway, clients } = build();
    clients.orders.create.mockResolvedValue(ordemComQr());

    await gateway.createPixCharge(PEDIDO_PIX);

    const { body } = clients.orders.create.mock.calls[0][0];
    // `3600` não é "o padrão de 24h": é payload inválido, ou pior, aceito e
    // interpretado de um jeito que ninguém previu.
    expect(body.transactions.payments[0].expiration_time).toBe('PT1H');
  });

  it('lê o QR aninhado, não na raiz', async () => {
    const { gateway, clients } = build();
    clients.orders.create.mockResolvedValue(ordemComQr());

    const result = await gateway.createPixCharge(PEDIDO_PIX);

    expect(result.brCode).toBe('00020126580014br.gov.bcb.pix...');
    // **`data:` URI, não base64 cru.** A porta promete "pronto para
    // `<img src>`" e o modal usa assim; o provedor anterior devolvia a URI
    // completa, este devolve só o base64. Cru, a imagem quebra — e como o
    // copia-e-cola continua ao lado, a tela não parece com defeito.
    expect(result.brCodeBase64).toBe('data:image/png;base64,iVBORw0KGgo=');
  });

  it('não duplica o prefixo se o provedor já mandar a URI', () => {
    expect(toDataUri('data:image/png;base64,AAA')).toBe(
      'data:image/png;base64,AAA',
    );
  });

  it('order criada de forma assíncrona reconsulta antes de desistir', async () => {
    const { gateway, clients } = build();
    // Sem QR na criação: a doc avisa que "a order fica com o status de
    // processando e sem informações".
    clients.orders.create.mockResolvedValue({
      id: 'ORD01PIX',
      status: 'processing',
    });
    clients.orders.get.mockResolvedValue(ordemComQr());

    const result = await gateway.createPixCharge(PEDIDO_PIX);

    expect(clients.orders.get).toHaveBeenCalledWith({ id: 'ORD01PIX' });
    expect(result.brCode).toBeTruthy();
  });

  it('sem QR nem depois da reconsulta, estoura — nunca `brCode: undefined`', async () => {
    const { gateway, clients } = build();
    clients.orders.create.mockResolvedValue({
      id: 'ORD01PIX',
      status: 'processing',
    });
    clients.orders.get.mockResolvedValue({
      id: 'ORD01PIX',
      status: 'processing',
    });

    // Um `undefined` aqui atravessa backend, DTO e modal sem ninguém
    // reclamar, e termina numa tela em branco sem erro. O erro cai no catch de
    // `issueCharge`, que degrada com aviso.
    await expect(gateway.createPixCharge(PEDIDO_PIX)).rejects.toThrow(
      /sem QR Code/,
    );
  });

  it('meio QR não serve: a leitura é tudo ou nada', () => {
    const semImagem = {
      transactions: { payments: [{ payment_method: { qr_code: 'abc' } }] },
    };
    expect(readPixCodes(semImagem as any)).toBeUndefined();
  });
});

describe('MercadoPagoGateway — assinatura do webhook', () => {
  /** O manifesto exatamente como a doc o define, para gerar o vetor. */
  function assinar(dataId: string, requestId: string, ts: string) {
    const manifesto = `id:${dataId};request-id:${requestId};ts:${ts};`;
    return createHmac('sha256', SECRET).update(manifesto).digest('hex');
  }

  const REQUEST_ID = '2066ca19-c6f1-498a-be75-1923005edd06';
  const TS = '1742505638683';
  const ORDER_ID = 'ORD01JQ4S4KY8HWQ6NA5PXB65B3D3';

  it('valida uma notificação de order, com o id em MAIÚSCULAS', () => {
    const { gateway } = build();
    // Ids de order são maiúsculos: esta não é uma borda, é o caso normal. O
    // manifesto usa a versão em minúsculas, como a doc manda — sem essa regra,
    // 100% das notificações de order seriam recusadas.
    const v1 = assinar(ORDER_ID.toLowerCase(), REQUEST_ID, TS);

    expect(() =>
      gateway.verifyNotification({
        xSignature: `ts=${TS},v1=${v1}`,
        xRequestId: REQUEST_ID,
        dataId: ORDER_ID,
      }),
    ).not.toThrow();
  });

  it('recusa assinatura adulterada', () => {
    const { gateway } = build();

    expect(() =>
      gateway.verifyNotification({
        xSignature: `ts=${TS},v1=${'0'.repeat(64)}`,
        xRequestId: REQUEST_ID,
        dataId: ORDER_ID,
      }),
    ).toThrow();
  });

  it('o manifesto tem ponto-e-vírgula no fim', () => {
    const { gateway } = build();
    const semTerminador = createHmac('sha256', SECRET)
      .update(`id:${ORDER_ID.toLowerCase()};request-id:${REQUEST_ID};ts:${TS}`)
      .digest('hex');

    // Um caractere muda o HMAC inteiro. O sintoma de errar isto é 100% dos
    // webhooks recusados — ou, se alguém "consertar" com um bypass, 100%
    // aceitos sem conferir.
    expect(() =>
      gateway.verifyNotification({
        xSignature: `ts=${TS},v1=${semTerminador}`,
        xRequestId: REQUEST_ID,
        dataId: ORDER_ID,
      }),
    ).toThrow();
  });

  it('campo ausente sai do manifesto, em vez de virar string vazia', () => {
    const { gateway } = build();
    // `request-id:abc;ts:123;` é um manifesto **diferente** de
    // `id:;request-id:abc;ts:123;`.
    const semId = createHmac('sha256', SECRET)
      .update(`request-id:${REQUEST_ID};ts:${TS};`)
      .digest('hex');

    expect(() =>
      gateway.verifyNotification({
        xSignature: `ts=${TS},v1=${semId}`,
        xRequestId: REQUEST_ID,
        dataId: undefined,
      }),
    ).not.toThrow();
  });

  it('segredo ausente recusa, nunca aceita sem conferir', () => {
    const { gateway } = build({ MP_WEBHOOK_SECRET: '' });
    const v1 = assinar(ORDER_ID.toLowerCase(), REQUEST_ID, TS);

    // Sem isto, um POST anônimo vira assinatura ativa.
    expect(() =>
      gateway.verifyNotification({
        xSignature: `ts=${TS},v1=${v1}`,
        xRequestId: REQUEST_ID,
        dataId: ORDER_ID,
      }),
    ).toThrow(/MP_WEBHOOK_SECRET/);
  });
});

describe('MercadoPagoGateway — o vocabulário legado não entrou', () => {
  it('nenhum arquivo do gateway compara status com `approved`', () => {
    const fs = require('node:fs') as typeof import('node:fs');
    const arquivos = [
      'mercadopago.gateway.ts',
      'mercadopago.status.ts',
      'mercadopago-webhook.controller.ts',
      'subscription.service.ts',
    ];

    for (const arquivo of arquivos) {
      const codigo = fs
        .readFileSync(`${__dirname}/${arquivo}`, 'utf8')
        // Comentários podem citar a palavra — é assim que se explica por que
        // ela não pode ser usada.
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');

      // `approved` é o vocabulário da API de Pagamentos, o caminho legado. Um
      // `if (status === 'approved')` sobre uma order **nunca** é verdadeiro:
      // ninguém recebe acesso e nenhum erro é lançado.
      expect(codigo).not.toContain('approved');
    }
  });
});

describe('conversões de fronteira', () => {
  it('valores viram string com duas casas', () => {
    expect(toAmountString(1200)).toBe('1200.00');
    expect(toAmountString(2280)).toBe('2280.00');
    expect(toAmountString(199.9)).toBe('199.90');
  });

  it('segundos viram duração ISO 8601', () => {
    expect(toIsoDuration(3600)).toBe('PT1H');
    expect(toIsoDuration(1800)).toBe('PT30M');
    expect(toIsoDuration(5400)).toBe('PT1H30M');
  });
});
