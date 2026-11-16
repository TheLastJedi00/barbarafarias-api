import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { GatewayRejectedError } from '../subscriptions/mercadopago.gateway';
import {
  StorePurchaseService,
  canWithdraw,
  storeReference,
} from './store-purchase.service';
import { StoreProduct } from './store-product.model';
import { StorePurchase } from './store-purchase.model';

const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();
const ahead = (days: number) => new Date(Date.now() + days * DAY).toISOString();

const buyerUser = {
  id: 'u1',
  fullName: 'Lead Silva',
  email: 'lead@example.com',
  phone: '11999998888',
  cpf: '39053344705',
  isPaying: false,
  tier: 'modules',
};

const requester = {
  sub: 'u1',
  email: 'lead@example.com',
  role: 'student' as const,
};

function product(overrides: Partial<StoreProduct> = {}): StoreProduct {
  return {
    id: 'p1',
    kind: 'module',
    title: 'Módulo 1 — A1',
    description: '',
    price: 97,
    maxInstallments: 12,
    published: true,
    order: 0,
    level: 'A1',
    moduleId: 'm1',
    files: [],
    createdAt: 't0',
    updatedAt: 't0',
    ...overrides,
  };
}

function purchase(overrides: Partial<StorePurchase> = {}): StorePurchase {
  return {
    id: 'c1',
    userId: 'u1',
    productId: 'p1',
    kind: 'module',
    level: 'A1',
    moduleId: 'm1',
    titleSnapshot: 'Módulo 1 — A1',
    priceSnapshot: 97,
    installments: 1,
    method: 'PIX',
    status: 'PENDING',
    gateway: {},
    termsVersion: '1.0',
    createdAt: ago(1),
    updatedAt: ago(1),
    ...overrides,
  };
}

function setup(env: Record<string, string> = {}) {
  const products = { findById: jest.fn().mockResolvedValue(product()) };
  const purchases = {
    newId: jest.fn().mockReturnValue('c1'),
    findById: jest.fn(),
    findByUser: jest.fn().mockResolvedValue([]),
    findByOrderId: jest.fn().mockResolvedValue(null),
    findAll: jest.fn().mockResolvedValue([]),
    save: jest.fn().mockResolvedValue(undefined),
  };
  const users = { findById: jest.fn().mockResolvedValue({ ...buyerUser }) };
  const legal = {
    requirement: jest.fn().mockResolvedValue({ publishedVersion: '1.0' }),
  };
  const gateway = {
    isEnabled: jest.fn().mockReturnValue(true),
    createPixCharge: jest.fn().mockResolvedValue({
      id: 'ORD-PIX',
      brCode: '000201…',
      brCodeBase64: 'data:image/png;base64,QR',
    }),
    createCheckout: jest.fn().mockResolvedValue({
      id: 'ORD-CARD',
      provider: 'MERCADOPAGO',
      outcome: 'PAID',
    }),
    fetchChargeOutcome: jest.fn(),
    refundOrder: jest.fn().mockResolvedValue({ status: 'refunded' }),
  };
  const config = { get: (key: string) => env[key] };
  const notifications = {
    storePurchasePaid: jest.fn().mockResolvedValue(undefined),
    storePurchaseRefunded: jest.fn().mockResolvedValue(undefined),
  };
  const storage = {
    signedReadUrl: jest.fn().mockResolvedValue('https://signed'),
  };
  const service = new StorePurchaseService(
    products as any,
    purchases as any,
    users as any,
    legal as any,
    gateway as any,
    gateway as any,
    config as any,
    notifications as any,
    storage as any,
  );
  const lastSaved = (): StorePurchase =>
    purchases.save.mock.calls.at(-1)![0] as StorePurchase;
  return {
    service,
    products,
    purchases,
    users,
    legal,
    gateway,
    notifications,
    storage,
    lastSaved,
  };
}

const createPix = {
  productId: 'p1',
  method: 'PIX' as const,
  termsVersion: '1.0',
};

describe('StorePurchaseService (spec 032 §7)', () => {
  describe('create', () => {
    it('PIX: grava a compra pendente, emite o QR com a referência da loja e guarda a order', async () => {
      const { service, gateway, lastSaved } = setup();
      const res = await service.create(requester, createPix);

      const charge = gateway.createPixCharge.mock.calls[0][0];
      expect(charge).toMatchObject({
        amount: 97,
        externalId: storeReference('c1'),
        customer: { taxId: '39053344705', email: 'lead@example.com' },
      });
      expect(res.pixCopyPaste).toBe('000201…');
      expect(res.pixQrCodeUrl).toContain('data:image/png');
      expect(lastSaved()).toMatchObject({
        status: 'PENDING',
        method: 'PIX',
        priceSnapshot: 97,
        termsVersion: '1.0',
        gateway: { orderId: 'ORD-PIX' },
      });
      expect(res.purchase.active).toBe(false);
    });

    it('cartão: não cobra ainda, devolve o valor e o teto de parcelas do produto', async () => {
      const { service, gateway, products } = setup();
      products.findById.mockResolvedValue(product({ maxInstallments: 6 }));
      const res = await service.create(requester, {
        ...createPix,
        method: 'CREDIT_CARD',
      });
      expect(res.card).toEqual({ amount: 97, maxInstallments: 6 });
      expect(gateway.createCheckout).not.toHaveBeenCalled();
    });

    it('404 para produto despublicado', async () => {
      const { service, products } = setup();
      products.findById.mockResolvedValue(product({ published: false }));
      await expect(service.create(requester, createPix)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('exige CPF e celular antes de chegar ao gateway', async () => {
      const { service, users, gateway } = setup();
      users.findById.mockResolvedValue({ ...buyerUser, cpf: undefined });
      await expect(service.create(requester, createPix)).rejects.toThrow('CPF');
      expect(gateway.createPixCharge).not.toHaveBeenCalled();
    });

    it('assinante não compra módulo do próprio nível', async () => {
      const { service, users } = setup();
      users.findById.mockResolvedValue({
        ...buyerUser,
        isPaying: true,
        level: 'A1',
      });
      await expect(service.create(requester, createPix)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('assinante compra módulo de outro nível', async () => {
      const { service, users } = setup();
      users.findById.mockResolvedValue({
        ...buyerUser,
        isPaying: true,
        level: 'B1',
      });
      await expect(service.create(requester, createPix)).resolves.toBeDefined();
    });

    it('não vende de novo o que ainda está valendo', async () => {
      const { service, purchases } = setup();
      purchases.findByUser.mockResolvedValue([
        purchase({ status: 'PAID', paidAt: ago(3), accessUntil: ahead(87) }),
      ]);
      await expect(service.create(requester, createPix)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('recompra depois de vencer é uma compra nova', async () => {
      const { service, purchases, lastSaved } = setup();
      purchases.findByUser.mockResolvedValue([
        purchase({
          id: 'antiga',
          status: 'PAID',
          paidAt: ago(100),
          accessUntil: ago(10),
        }),
      ]);
      await service.create(requester, createPix);
      expect(lastSaved().id).toBe('c1');
    });

    it('termo desatualizado: 409 para o comprador reler', async () => {
      const { service, legal } = setup();
      legal.requirement.mockResolvedValue({ publishedVersion: '1.1' });
      await expect(service.create(requester, createPix)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('sem termo publicado a loja não vende', async () => {
      const { service, legal } = setup();
      legal.requirement.mockResolvedValue({ publishedVersion: null });
      await expect(service.create(requester, createPix)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(legal.requirement).toHaveBeenCalledWith('store-purchase');
    });

    it('reaproveita a compra pendente do mesmo meio (mesmo QR)', async () => {
      const { service, purchases, gateway } = setup();
      purchases.findByUser.mockResolvedValue([
        purchase({ id: 'pendente', gateway: { orderId: 'ORD-PIX' } }),
      ]);
      await service.create(requester, createPix);
      expect(gateway.createPixCharge.mock.calls[0][0].externalId).toBe(
        storeReference('pendente'),
      );
      expect(purchases.newId).not.toHaveBeenCalled();
    });

    it('troca de meio cancela a pendente antiga', async () => {
      const { service, purchases } = setup();
      purchases.findByUser.mockResolvedValue([
        purchase({ id: 'pendente', method: 'CREDIT_CARD' }),
      ]);
      await service.create(requester, createPix);
      const saved = purchases.save.mock.calls.map((c) => c[0]);
      expect(saved[0]).toMatchObject({ id: 'pendente', status: 'CANCELLED' });
    });

    it('gateway desligado: compra gravada com aviso, sem 500', async () => {
      const { service, gateway } = setup();
      gateway.isEnabled.mockReturnValue(false);
      const res = await service.create(requester, createPix);
      expect(res.warning).toBeDefined();
      expect(gateway.createPixCharge).not.toHaveBeenCalled();
    });
  });

  describe('payWithCard', () => {
    const cardDto = {
      token: 'tok',
      paymentMethodId: 'master',
      installments: 12,
    };

    it('pago na hora: libera 90 dias e grava as parcelas escolhidas', async () => {
      const { service, purchases, gateway, lastSaved } = setup();
      purchases.findById.mockResolvedValue(purchase({ method: 'CREDIT_CARD' }));

      const res = await service.payWithCard(requester, 'c1', cardDto);

      const checkout = gateway.createCheckout.mock.calls[0][0];
      expect(checkout).toMatchObject({
        amount: 97,
        installments: 12,
        recurring: { cycles: 12 },
        externalId: storeReference('c1'),
        card: { token: 'tok', paymentMethodId: 'master' },
      });
      expect(res.outcome).toBe('PAID');
      const saved = lastSaved();
      expect(saved).toMatchObject({
        status: 'PAID',
        installments: 12,
        gateway: { orderId: 'ORD-CARD' },
      });
      const days =
        (Date.parse(saved.accessUntil!) - Date.parse(saved.paidAt!)) / DAY;
      expect(days).toBe(90);
    });

    it('parcelas acima do teto do produto são recusadas', async () => {
      const { service, purchases, products, gateway } = setup();
      purchases.findById.mockResolvedValue(purchase({ method: 'CREDIT_CARD' }));
      products.findById.mockResolvedValue(product({ maxInstallments: 3 }));
      await expect(
        service.payWithCard(requester, 'c1', cardDto),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(gateway.createCheckout).not.toHaveBeenCalled();
    });

    it('tentativa anterior já paga lá fora: confirma sem cobrar de novo', async () => {
      const { service, purchases, gateway, lastSaved } = setup();
      purchases.findById.mockResolvedValue(
        purchase({ method: 'CREDIT_CARD', gateway: { orderId: 'ORD-OLD' } }),
      );
      gateway.fetchChargeOutcome.mockResolvedValue({
        id: 'ORD-OLD',
        outcome: 'PAID',
      });

      const res = await service.payWithCard(requester, 'c1', cardDto);
      expect(gateway.createCheckout).not.toHaveBeenCalled();
      expect(res.outcome).toBe('PAID');
      expect(lastSaved().status).toBe('PAID');
    });

    it('desafio 3DS não ativa nada', async () => {
      const { service, purchases, gateway, lastSaved } = setup();
      purchases.findById.mockResolvedValue(purchase({ method: 'CREDIT_CARD' }));
      gateway.createCheckout.mockResolvedValue({
        id: 'ORD-CARD',
        outcome: 'CHALLENGE',
        challengeUrl: 'https://3ds',
      });
      const res = await service.payWithCard(requester, 'c1', cardDto);
      expect(res).toMatchObject({
        outcome: 'CHALLENGE',
        challengeUrl: 'https://3ds',
      });
      expect(lastSaved().status).toBe('PENDING');
    });

    it('recusa do emissor vira a frase do aluno, não 500', async () => {
      const { service, purchases, gateway } = setup();
      purchases.findById.mockResolvedValue(purchase({ method: 'CREDIT_CARD' }));
      gateway.createCheckout.mockRejectedValue(
        new GatewayRejectedError('recusado'),
      );
      await expect(
        service.payWithCard(requester, 'c1', cardDto),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('compra de outra pessoa é 404', async () => {
      const { service, purchases } = setup();
      purchases.findById.mockResolvedValue(
        purchase({ method: 'CREDIT_CARD', userId: 'outra' }),
      );
      await expect(
        service.payWithCard(requester, 'c1', cardDto),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('handleOrderEvent (webhook)', () => {
    it('order que não é da loja volta false para a assinatura tratar', async () => {
      const { service } = setup();
      expect(
        await service.handleOrderEvent('ORD-X', {
          status: 'processed',
          status_detail: 'accredited',
        }),
      ).toBe(false);
    });

    it('só o par processed/accredited libera o acesso', async () => {
      const { service, purchases, lastSaved } = setup();
      purchases.findByOrderId.mockResolvedValue(purchase());

      await service.handleOrderEvent('ORD-PIX', {
        status: 'processed',
        status_detail: 'partially_refunded',
      });
      expect(purchases.save).not.toHaveBeenCalled();

      expect(
        await service.handleOrderEvent('ORD-PIX', {
          status: 'processed',
          status_detail: 'accredited',
        }),
      ).toBe(true);
      expect(lastSaved()).toMatchObject({ status: 'PAID' });
    });

    it('reentrega do pago não mexe em nada (idempotente)', async () => {
      const { service, purchases } = setup();
      purchases.findByOrderId.mockResolvedValue(
        purchase({ status: 'PAID', paidAt: ago(1), accessUntil: ahead(89) }),
      );
      await service.handleOrderEvent('ORD-PIX', {
        status: 'processed',
        status_detail: 'accredited',
      });
      expect(purchases.save).not.toHaveBeenCalled();
    });

    it('order paga de compra cancelada (troca de meio) libera mesmo assim', async () => {
      const { service, purchases, lastSaved } = setup();
      purchases.findByOrderId.mockResolvedValue(
        purchase({ status: 'CANCELLED' }),
      );
      await service.handleOrderEvent('ORD-PIX', {
        status: 'processed',
        status_detail: 'accredited',
      });
      expect(lastSaved().status).toBe('PAID');
    });

    it('estorno feito fora daqui e contestação cortam o acesso', async () => {
      const { service, purchases, lastSaved } = setup();
      const paid = purchase({
        status: 'PAID',
        paidAt: ago(1),
        accessUntil: ahead(89),
      });
      purchases.findByOrderId.mockResolvedValue(paid);

      await service.handleOrderEvent('ORD-PIX', { status: 'refunded' });
      expect(lastSaved()).toMatchObject({
        status: 'REFUNDED',
        refund: { by: 'gateway' },
      });

      await service.handleOrderEvent('ORD-PIX', { status: 'charged_back' });
      expect(lastSaved().status).toBe('CHARGED_BACK');
    });

    it('PIX expirado cancela a pendente', async () => {
      const { service, purchases, lastSaved } = setup();
      purchases.findByOrderId.mockResolvedValue(purchase());
      await service.handleOrderEvent('ORD-PIX', { status: 'expired' });
      expect(lastSaved().status).toBe('CANCELLED');
    });

    it('status desconhecido não ativa nada', async () => {
      const { service, purchases } = setup();
      purchases.findByOrderId.mockResolvedValue(purchase());
      await service.handleOrderEvent('ORD-PIX', { status: 'algo_novo' });
      expect(purchases.save).not.toHaveBeenCalled();
    });
  });

  describe('desistência e reembolso', () => {
    const paid = (paidDaysAgo: number) =>
      purchase({
        status: 'PAID',
        paidAt: ago(paidDaysAgo),
        accessUntil: ahead(90 - paidDaysAgo),
        gateway: { orderId: 'ORD-PIX' },
      });

    it('dentro de 7 dias: estorna no gateway e corta o acesso na hora', async () => {
      const { service, purchases, gateway, lastSaved } = setup();
      purchases.findById.mockResolvedValue(paid(2));

      const view = await service.withdraw(requester, 'c1');

      expect(gateway.refundOrder).toHaveBeenCalledWith(
        'ORD-PIX',
        storeReference('c1'),
      );
      expect(lastSaved()).toMatchObject({
        status: 'REFUNDED',
        refund: { by: 'buyer' },
      });
      expect(view.active).toBe(false);
    });

    it('depois de 7 dias o comprador não desiste sozinho', async () => {
      const { service, purchases, gateway } = setup();
      purchases.findById.mockResolvedValue(paid(8));
      await expect(service.withdraw(requester, 'c1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(gateway.refundOrder).not.toHaveBeenCalled();
    });

    it('gateway recusou o estorno: o acesso continua', async () => {
      const { service, purchases, gateway } = setup();
      purchases.findById.mockResolvedValue(paid(2));
      gateway.refundOrder.mockRejectedValue(new Error('falhou'));
      await expect(service.withdraw(requester, 'c1')).rejects.toThrow('falhou');
      expect(purchases.save).not.toHaveBeenCalled();
    });

    it('gerente reembolsa depois dos 7 dias, até 180', async () => {
      const { service, purchases, lastSaved } = setup();
      purchases.findById.mockResolvedValue(paid(30));
      await service.adminRefund('c1', { reason: '  pedido por e-mail ' });
      expect(lastSaved()).toMatchObject({
        status: 'REFUNDED',
        refund: { by: 'manager', reason: 'pedido por e-mail' },
      });

      purchases.findById.mockResolvedValue(paid(181));
      await expect(service.adminRefund('c1', {})).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('canWithdraw: só pago e dentro do prazo', () => {
      expect(canWithdraw({ status: 'PAID', paidAt: ago(6) })).toBe(true);
      expect(canWithdraw({ status: 'PAID', paidAt: ago(8) })).toBe(false);
      expect(canWithdraw({ status: 'REFUNDED', paidAt: ago(1) })).toBe(false);
    });
  });

  describe('material para baixar', () => {
    const file = (id: string, status: 'ready' | 'uploading') => ({
      id,
      fileName: `Apostila ${id}.pdf`,
      storagePath: `store-products/p2/files/${id}.pdf`,
      mimeType: 'application/pdf',
      size: 10,
      status,
      uploadedAt: '',
    });
    const download = () =>
      product({
        id: 'p2',
        kind: 'download',
        level: undefined,
        moduleId: undefined,
        files: [file('f1', 'ready'), file('f2', 'uploading')],
      });
    const compra = (overrides: Partial<StorePurchase> = {}) =>
      purchase({
        productId: 'p2',
        kind: 'download',
        level: undefined,
        moduleId: undefined,
        status: 'PAID',
        paidAt: ago(1),
        accessUntil: ahead(89),
        ...overrides,
      });

    it('lista só os arquivos prontos, sem caminho', async () => {
      const { service, purchases, products } = setup();
      purchases.findById.mockResolvedValue(compra());
      products.findById.mockResolvedValue(download());
      const files = await service.listFiles(requester, 'c1');
      expect(files).toEqual([
        {
          id: 'f1',
          fileName: 'Apostila f1.pdf',
          mimeType: 'application/pdf',
          size: 10,
        },
      ]);
    });

    it('baixa com link de 15 min e o nome original', async () => {
      const { service, purchases, products, storage } = setup();
      purchases.findById.mockResolvedValue(compra());
      products.findById.mockResolvedValue(download());
      expect(await service.downloadFile(requester, 'c1', 'f1')).toEqual({
        url: 'https://signed',
      });
      expect(storage.signedReadUrl).toHaveBeenCalledWith(
        'store-products/p2/files/f1.pdf',
        15 * 60 * 1000,
        'Apostila f1.pdf',
      );
    });

    it('vencida ou reembolsada não baixa', async () => {
      const { service, purchases, products } = setup();
      products.findById.mockResolvedValue(download());
      purchases.findById.mockResolvedValue(compra({ accessUntil: ago(1) }));
      await expect(
        service.downloadFile(requester, 'c1', 'f1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      purchases.findById.mockResolvedValue(compra({ status: 'REFUNDED' }));
      await expect(
        service.downloadFile(requester, 'c1', 'f1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('compra de módulo não tem arquivo para baixar', async () => {
      const { service, purchases } = setup();
      purchases.findById.mockResolvedValue(
        purchase({ status: 'PAID', paidAt: ago(1), accessUntil: ahead(89) }),
      );
      await expect(service.listFiles(requester, 'c1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('arquivo ainda subindo é 404', async () => {
      const { service, purchases, products } = setup();
      purchases.findById.mockResolvedValue(compra());
      products.findById.mockResolvedValue(download());
      await expect(
        service.downloadFile(requester, 'c1', 'f2'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('e-mails', () => {
    it('pagamento confirmado avisa uma vez; a reentrega do webhook não repete', async () => {
      const { service, purchases, notifications } = setup();
      purchases.findByOrderId.mockResolvedValue(purchase());
      await service.handleOrderEvent('ORD-PIX', {
        status: 'processed',
        status_detail: 'accredited',
      });
      expect(notifications.storePurchasePaid).toHaveBeenCalledTimes(1);
      expect(notifications.storePurchasePaid.mock.calls[0][0]).toMatchObject({
        status: 'PAID',
      });

      purchases.findByOrderId.mockResolvedValue(
        purchase({ status: 'PAID', paidAt: ago(0), accessUntil: ahead(90) }),
      );
      await service.handleOrderEvent('ORD-PIX', {
        status: 'processed',
        status_detail: 'accredited',
      });
      expect(notifications.storePurchasePaid).toHaveBeenCalledTimes(1);
    });

    it('desistência avisa com quem desistiu', async () => {
      const { service, purchases, notifications } = setup();
      purchases.findById.mockResolvedValue(
        purchase({
          status: 'PAID',
          paidAt: ago(1),
          accessUntil: ahead(89),
          gateway: { orderId: 'ORD-PIX' },
        }),
      );
      await service.withdraw(requester, 'c1');
      expect(
        notifications.storePurchaseRefunded.mock.calls[0][0].refund.by,
      ).toBe('buyer');
    });
  });

  describe('leitura e simulação', () => {
    it('minhas compras: sem as canceladas, mais novas primeiro', async () => {
      const { service, purchases } = setup();
      purchases.findByUser.mockResolvedValue([
        purchase({ id: 'a', createdAt: ago(5) }),
        purchase({ id: 'b', status: 'CANCELLED', createdAt: ago(3) }),
        purchase({ id: 'c', createdAt: ago(1) }),
      ]);
      const list = await service.listMine(requester);
      expect(list.map((p) => p.id)).toEqual(['c', 'a']);
    });

    it('mock-pay só em DEV_MODE', async () => {
      const { service, purchases } = setup();
      purchases.findById.mockResolvedValue(purchase());
      await expect(service.mockPay(requester, 'c1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );

      const dev = setup({ DEV_MODE: 'true' });
      dev.purchases.findById.mockResolvedValue(purchase());
      const view = await dev.service.mockPay(requester, 'c1');
      expect(view).toMatchObject({ status: 'PAID', active: true });
    });

    it('lista da gerente traz nome e e-mail do comprador', async () => {
      const { service, purchases } = setup();
      purchases.findAll.mockResolvedValue([purchase({ status: 'PAID' })]);
      const list = await service.listAll();
      expect(list[0].buyer).toEqual({
        id: 'u1',
        name: 'Lead Silva',
        email: 'lead@example.com',
      });
    });
  });
});
