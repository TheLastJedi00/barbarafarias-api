import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';
import { LegalService } from '../legal/legal.service';
import { NotificationService } from '../notifications/notification.service';
import { CARD_REJECTED_MESSAGE } from '../subscriptions/subscription.service';
import {
  GatewayBusyError,
  GatewayConflictError,
  GatewayRejectedError,
} from '../subscriptions/mercadopago.gateway';
import {
  CHARGE_OUTCOMES,
  CardGateway,
  type ChargeOutcome,
  type CheckoutResult,
  PixGateway,
  type PaymentGateway,
} from '../subscriptions/payment.gateway';
import {
  ORDER_STATUS,
  isOrderPaid,
  type OrderStatusPair,
} from '../subscriptions/mercadopago.status';
import { hasPaidAccess } from '../users/paid-access';
import type { User } from '../users/user.entity';
import { UserRepository } from '../users/user.repository';
import { StorageService } from '../uploads/storage.service';
import {
  CreateStorePurchaseDto,
  PayStorePurchaseCardDto,
  RefundStorePurchaseDto,
} from './dto/store-purchase.dto';
import {
  STORE_ACCESS_DAYS,
  STORE_FILE_STATUS,
  STORE_PRODUCT_KIND,
  StoreProduct,
} from './store-product.model';
import {
  STORE_PURCHASE_STATUS,
  STORE_REFUND_LIMIT_DAYS,
  STORE_WITHDRAWAL_DAYS,
  StorePurchase,
  addDays,
  isPurchaseActive,
} from './store-purchase.model';
import { StoreProductRepository } from './store-product.repository';
import { StorePurchaseRepository } from './store-purchase.repository';

/** Validade do link de download de um arquivo comprado. */
const FILE_DOWNLOAD_TTL_MS = 15 * 60 * 1000;

/** Tipo do termo de compra no Painel Jurídico (spec 029/032). */
export const STORE_TERMS_TYPE = 'store-purchase';

/** O que a tela "Meus módulos" e o painel da gerente leem de uma compra. */
export interface StorePurchaseView {
  id: string;
  productId: string;
  kind: StorePurchase['kind'];
  title: string;
  level?: string;
  price: number;
  installments: number;
  method: StorePurchase['method'];
  status: StorePurchase['status'];
  paidAt?: string;
  accessUntil?: string;
  /** Dando acesso agora (pago e dentro da validade). */
  active: boolean;
  /** Último instante em que o comprador ainda pode desistir sozinho. */
  withdrawUntil?: string;
  canWithdraw: boolean;
  refund?: StorePurchase['refund'];
  createdAt: string;
}

export interface CreatePurchaseResponse {
  purchase: StorePurchaseView;
  pixQrCodeUrl?: string;
  pixCopyPaste?: string;
  /** Cartão: o que o Brick precisa. A cobrança nasce no `POST …/card`. */
  card?: { amount: number; maxInstallments: number };
  /** Gateway desligado ou congestionado: compra gravada, cobrança não. */
  warning?: string;
}

export interface CardPaymentResponse {
  purchase: StorePurchaseView;
  outcome: ChargeOutcome;
  challengeUrl?: string;
  warning?: string;
}

/** Referência da compra no gateway (`external_reference`). */
export function storeReference(purchaseId: string): string {
  return `store:${purchaseId}`;
}

/**
 * Compra na loja (spec 032 §7): PIX ou cartão em até 12x (juros do
 * comprador), confirmação pelo webhook, desistência em 7 dias e reembolso.
 *
 * As regras de cobrança são as da spec 023 e valem igual aqui: **só o par
 * `processed`/`accredited` ativa**, status desconhecido não libera nada, e
 * antes de cobrar o cartão de novo pergunta-se ao gateway se a tentativa
 * anterior não passou.
 */
@Injectable()
export class StorePurchaseService {
  private readonly logger = new Logger(StorePurchaseService.name);

  constructor(
    private readonly products: StoreProductRepository,
    private readonly purchases: StorePurchaseRepository,
    private readonly users: UserRepository,
    private readonly legal: LegalService,
    private readonly pix: PixGateway,
    private readonly card: CardGateway,
    private readonly config: ConfigService,
    private readonly notifications: NotificationService,
    private readonly storage: StorageService,
  ) {}

  // ---------------------------------------------------------------- compra

  async create(
    requester: AuthenticatedUser,
    dto: CreateStorePurchaseDto,
  ): Promise<CreatePurchaseResponse> {
    const product = await this.products.findById(dto.productId);
    if (!product || !product.published) {
      throw new NotFoundException('Produto não encontrado.');
    }
    const buyer = await this.requireBuyer(requester.sub);
    assertPayable(buyer);
    this.assertNotInPlan(buyer, product);

    const mine = await this.purchases.findByUser(requester.sub);
    const owned = mine.find(
      (p) => p.productId === product.id && isPurchaseActive(p),
    );
    if (owned) {
      throw new ConflictException(
        `Você já tem acesso a este produto até ${formatDate(owned.accessUntil!)}.`,
      );
    }

    const termsVersion = await this.currentTermsVersion();
    if (dto.termsVersion !== termsVersion) {
      throw new ConflictException(
        'O termo de compra foi atualizado. Leia a versão nova e aceite de novo.',
      );
    }

    // Uma compra pendente por produto. Mesmo meio: reaproveita — o PIX devolve
    // o mesmo QR (chave de idempotência) e o cartão confere a tentativa
    // anterior antes de cobrar. Meio diferente: a antiga é cancelada; se a
    // order dela ainda for paga lá fora, o webhook a reativa (`handleOrderEvent`).
    const pending = mine.find(
      (p) =>
        p.productId === product.id &&
        p.status === STORE_PURCHASE_STATUS.PENDING,
    );
    let purchase: StorePurchase;
    if (pending && pending.method === dto.method) {
      purchase = { ...pending, termsVersion, updatedAt: now() };
    } else {
      if (pending) await this.cancel(pending);
      purchase = this.newPurchase(requester.sub, product, dto, termsVersion);
    }
    await this.purchases.save(purchase);

    if (dto.method === 'CREDIT_CARD') {
      return {
        purchase: toView(purchase),
        card: {
          amount: purchase.priceSnapshot,
          maxInstallments: product.maxInstallments,
        },
        ...(this.card.isEnabled()
          ? {}
          : {
              warning: 'Pagamento indisponível no momento. Tente mais tarde.',
            }),
      };
    }

    return this.issuePix(purchase, buyer, product);
  }

  private async issuePix(
    purchase: StorePurchase,
    buyer: User,
    product: StoreProduct,
  ): Promise<CreatePurchaseResponse> {
    if (!this.pix.isEnabled()) {
      return {
        purchase: toView(purchase),
        warning: 'Pagamento indisponível no momento. Tente mais tarde.',
      };
    }
    try {
      const charge = await this.pix.createPixCharge({
        amount: purchase.priceSnapshot,
        description: purchase.titleSnapshot,
        externalId: storeReference(purchase.id),
        customer: customerOf(buyer),
        product: { key: `LOJA-${product.id}`, label: purchase.titleSnapshot },
      });
      const saved: StorePurchase = {
        ...purchase,
        gateway: { orderId: charge.id },
        updatedAt: now(),
      };
      await this.purchases.save(saved);
      return {
        purchase: toView(saved),
        pixQrCodeUrl: charge.brCodeBase64,
        pixCopyPaste: charge.brCode,
      };
    } catch (error) {
      this.logger.warn(
        `PIX da compra ${purchase.id} não emitido: ${String(error)}`,
      );
      return {
        purchase: toView(purchase),
        warning:
          'Não foi possível gerar o PIX agora. Tente novamente em instantes.',
      };
    }
  }

  async payWithCard(
    requester: AuthenticatedUser,
    purchaseId: string,
    dto: PayStorePurchaseCardDto,
  ): Promise<CardPaymentResponse> {
    const purchase = await this.requireOwn(requester.sub, purchaseId);
    if (purchase.method !== 'CREDIT_CARD') {
      throw new BadRequestException('Esta compra não é no cartão.');
    }
    if (purchase.status === STORE_PURCHASE_STATUS.PAID) {
      return { purchase: toView(purchase), outcome: CHARGE_OUTCOMES.PAID };
    }
    if (purchase.status !== STORE_PURCHASE_STATUS.PENDING) {
      throw new ConflictException('Esta compra não está mais aberta.');
    }

    const product = await this.products.findById(purchase.productId);
    const maxInstallments = product?.maxInstallments ?? 1;
    // **Nunca do que o front mandou sem conferir.** O Brick limita, mas a
    // régua é esta (falha silenciosa 18 da spec 023).
    if (dto.installments > maxInstallments) {
      throw new BadRequestException(
        `Este produto pode ser parcelado em até ${maxInstallments}x.`,
      );
    }
    if (!this.card.isEnabled()) {
      throw new ServiceUnavailableException(
        'Pagamento indisponível no momento. Tente mais tarde.',
      );
    }

    // **Antes de cobrar, ver se já não foi cobrado** (spec 023): uma tentativa
    // aprovada lá fora e não confirmada aqui, seguida de um novo envio com
    // token novo, seria um segundo débito.
    if (purchase.gateway.orderId) {
      const previous = await this.card.fetchChargeOutcome(
        purchase.gateway.orderId,
      );
      if (previous.outcome === CHARGE_OUTCOMES.PAID) {
        const paid = await this.markPaid(purchase);
        return { purchase: toView(paid), outcome: CHARGE_OUTCOMES.PAID };
      }
      if (previous.outcome === CHARGE_OUTCOMES.CHALLENGE) {
        return {
          purchase: toView(purchase),
          outcome: CHARGE_OUTCOMES.CHALLENGE,
          challengeUrl: previous.challengeUrl,
        };
      }
    }

    const buyer = await this.requireBuyer(requester.sub);
    assertPayable(buyer);

    let checkout: CheckoutResult;
    try {
      checkout = await this.card.createCheckout({
        amount: purchase.priceSnapshot,
        description: purchase.titleSnapshot,
        externalId: storeReference(purchase.id),
        customer: customerOf(buyer),
        product: {
          key: `LOJA-${purchase.productId}`,
          label: purchase.titleSnapshot,
        },
        plan: 'LOJA',
        planLabel: purchase.titleSnapshot,
        studentId: requester.sub,
        // Número de ciclos ≠ null: uma order só, parcelada pelo emissor.
        recurring: { cycles: dto.installments },
        installments: dto.installments,
        card: { token: dto.token, paymentMethodId: dto.paymentMethodId },
      });
    } catch (error) {
      if (error instanceof GatewayConflictError) {
        throw new BadRequestException(
          'Esta cobrança já foi tentada com outros dados. Feche e preencha o cartão novamente.',
        );
      }
      if (error instanceof GatewayRejectedError) {
        throw new BadRequestException(CARD_REJECTED_MESSAGE);
      }
      if (error instanceof GatewayBusyError) {
        return {
          purchase: toView(purchase),
          outcome: CHARGE_OUTCOMES.PENDING,
          warning:
            'O pagamento está congestionado no momento. Tente novamente em instantes.',
        };
      }
      throw error;
    }

    this.logger.log(
      `Cartão da compra ${purchase.id}: ${checkout.outcome} (${checkout.id})`,
    );
    let saved: StorePurchase = {
      ...purchase,
      installments: dto.installments,
      gateway: { orderId: checkout.id },
      updatedAt: now(),
    };
    await this.purchases.save(saved);

    if (checkout.outcome === CHARGE_OUTCOMES.PAID) {
      saved = await this.markPaid(saved);
    }
    if (checkout.outcome === CHARGE_OUTCOMES.REJECTED) {
      throw new BadRequestException(CARD_REJECTED_MESSAGE);
    }
    return {
      purchase: toView(saved),
      outcome: checkout.outcome,
      challengeUrl: checkout.challengeUrl,
    };
  }

  /**
   * Fim do desafio 3DS: a tela só sabe que a etapa acabou, não se o pagamento
   * passou. Relê a order em vez de esperar o webhook (spec 023).
   */
  async confirmCard(
    requester: AuthenticatedUser,
    purchaseId: string,
  ): Promise<CardPaymentResponse> {
    const purchase = await this.requireOwn(requester.sub, purchaseId);
    if (purchase.status === STORE_PURCHASE_STATUS.PAID) {
      return { purchase: toView(purchase), outcome: CHARGE_OUTCOMES.PAID };
    }
    if (!purchase.gateway.orderId || !this.card.isEnabled()) {
      return { purchase: toView(purchase), outcome: CHARGE_OUTCOMES.PENDING };
    }
    const result = await this.card.fetchChargeOutcome(purchase.gateway.orderId);
    const updated =
      result.outcome === CHARGE_OUTCOMES.PAID
        ? await this.markPaid(purchase)
        : purchase;
    return {
      purchase: toView(updated),
      outcome: result.outcome,
      challengeUrl: result.challengeUrl,
    };
  }

  // --------------------------------------------------------------- webhook

  /**
   * A order notificada é da loja? Devolve `false` quando não é, para o webhook
   * entregá-la à assinatura. Idempotente: o Mercado Pago reenvia até 2xx.
   */
  async handleOrderEvent(
    orderId: string,
    order: OrderStatusPair,
  ): Promise<boolean> {
    const purchase = await this.purchases.findByOrderId(orderId);
    if (!purchase) return false;

    if (isOrderPaid(order)) {
      // `CANCELLED` também: o comprador trocou de meio com um cartão ainda em
      // desafio 3DS, e ele foi concluído depois. Dinheiro entrou, acesso sai.
      if (
        purchase.status === STORE_PURCHASE_STATUS.PENDING ||
        purchase.status === STORE_PURCHASE_STATUS.CANCELLED
      ) {
        await this.markPaid(purchase);
      }
      return true;
    }

    switch (order.status) {
      case ORDER_STATUS.REFUNDED:
        if (purchase.status !== STORE_PURCHASE_STATUS.REFUNDED) {
          const refunded = await this.save({
            ...purchase,
            status: STORE_PURCHASE_STATUS.REFUNDED,
            refund: purchase.refund ?? { by: 'gateway', at: now() },
          });
          await this.notifications.storePurchaseRefunded(refunded);
        }
        return true;
      case ORDER_STATUS.CHARGED_BACK:
        if (purchase.status !== STORE_PURCHASE_STATUS.CHARGED_BACK) {
          await this.save({
            ...purchase,
            status: STORE_PURCHASE_STATUS.CHARGED_BACK,
          });
        }
        return true;
      case ORDER_STATUS.CANCELED:
      case ORDER_STATUS.EXPIRED:
      case ORDER_STATUS.FAILED:
        if (purchase.status === STORE_PURCHASE_STATUS.PENDING) {
          await this.cancel(purchase);
        }
        return true;
      default:
        this.logger.log(
          `Order ${orderId} da compra ${purchase.id} em ${order.status}/${order.status_detail}: nada a fazer.`,
        );
        return true;
    }
  }

  // ------------------------------------------------- desistência/reembolso

  /** Desistência do comprador: até 7 dias do pagamento (CDC art. 49). */
  async withdraw(
    requester: AuthenticatedUser,
    purchaseId: string,
  ): Promise<StorePurchaseView> {
    const purchase = await this.requireOwn(requester.sub, purchaseId);
    if (!canWithdraw(purchase)) {
      throw new BadRequestException(
        `A desistência vale por ${STORE_WITHDRAWAL_DAYS} dias a partir do pagamento.`,
      );
    }
    return toView(await this.refund(purchase, 'buyer'));
  }

  /** Reembolso pela gerente, dentro do prazo do gateway. */
  async adminRefund(
    purchaseId: string,
    dto: RefundStorePurchaseDto,
  ): Promise<StorePurchaseView> {
    const purchase = await this.purchases.findById(purchaseId);
    if (!purchase) throw new NotFoundException('Compra não encontrada.');
    if (purchase.status !== STORE_PURCHASE_STATUS.PAID || !purchase.paidAt) {
      throw new BadRequestException('Só compras pagas podem ser reembolsadas.');
    }
    if (
      Date.now() > Date.parse(addDays(purchase.paidAt, STORE_REFUND_LIMIT_DAYS))
    ) {
      throw new BadRequestException(
        `O Mercado Pago só estorna até ${STORE_REFUND_LIMIT_DAYS} dias depois do pagamento.`,
      );
    }
    return toView(await this.refund(purchase, 'manager', dto.reason));
  }

  /**
   * Pede o estorno e **corta o acesso na hora**. O webhook confirma depois, e
   * por isso o `REFUNDED` dele é no-op aqui. Se o gateway recusar, nada muda:
   * o acesso só cai junto com o dinheiro voltando.
   */
  private async refund(
    purchase: StorePurchase,
    by: 'buyer' | 'manager',
    reason?: string,
  ): Promise<StorePurchase> {
    const gateway = this.gatewayFor(purchase);
    if (purchase.gateway.orderId && gateway.isEnabled()) {
      try {
        await gateway.refundOrder(
          purchase.gateway.orderId,
          storeReference(purchase.id),
        );
      } catch (error) {
        if (error instanceof GatewayBusyError) {
          throw new ServiceUnavailableException(
            'O estorno está congestionado no momento. Tente novamente em instantes.',
          );
        }
        throw error;
      }
    } else if (!this.isDevMode()) {
      throw new ServiceUnavailableException(
        'Estorno indisponível no momento. Tente mais tarde.',
      );
    }

    const refunded = await this.save({
      ...purchase,
      status: STORE_PURCHASE_STATUS.REFUNDED,
      refund: {
        by,
        at: now(),
        ...(reason?.trim() ? { reason: reason.trim() } : {}),
      },
    });
    await this.notifications.storePurchaseRefunded(refunded);
    return refunded;
  }

  // --------------------------------------------------------------- leitura

  async listMine(requester: AuthenticatedUser): Promise<StorePurchaseView[]> {
    const mine = await this.purchases.findByUser(requester.sub);
    return mine
      .filter((p) => p.status !== STORE_PURCHASE_STATUS.CANCELLED)
      .sort(byNewest)
      .map(toView);
  }

  /** Painel da gerente: todas as compras que chegaram a ser pagas ou estão em aberto. */
  async listAll(): Promise<
    (StorePurchaseView & {
      buyer: { id: string; name: string; email: string };
    })[]
  > {
    const all = (await this.purchases.findAll())
      .filter((p) => p.status !== STORE_PURCHASE_STATUS.CANCELLED)
      .sort(byNewest);
    const ids = [...new Set(all.map((p) => p.userId))];
    const buyers = new Map(
      await Promise.all(
        ids.map(async (id) => [id, await this.users.findById(id)] as const),
      ),
    );
    return all.map((p) => {
      const buyer = buyers.get(p.userId);
      return {
        ...toView(p),
        buyer: {
          id: p.userId,
          name: buyer?.fullName ?? '',
          email: buyer?.email ?? '',
        },
      };
    });
  }

  // ------------------------------------------------- material para baixar

  /** Os arquivos de um produto `download` que a pessoa comprou e ainda vale. */
  async listFiles(
    requester: AuthenticatedUser,
    purchaseId: string,
  ): Promise<
    { id: string; fileName: string; mimeType: string; size: number }[]
  > {
    const { product } = await this.activeDownload(requester, purchaseId);
    return product.files
      .filter((f) => f.status === STORE_FILE_STATUS.READY)
      .map((f) => ({
        id: f.id,
        fileName: f.fileName,
        mimeType: f.mimeType,
        size: f.size,
      }));
  }

  /** Link de 15 min com o nome original. Aqui baixar é o que foi comprado. */
  async downloadFile(
    requester: AuthenticatedUser,
    purchaseId: string,
    fileId: string,
  ): Promise<{ url: string }> {
    const { product } = await this.activeDownload(requester, purchaseId);
    const file = product.files.find(
      (f) => f.id === fileId && f.status === STORE_FILE_STATUS.READY,
    );
    if (!file) throw new NotFoundException('Arquivo não encontrado.');
    return {
      url: await this.storage.signedReadUrl(
        file.storagePath,
        FILE_DOWNLOAD_TTL_MS,
        file.fileName,
      ),
    };
  }

  private async activeDownload(
    requester: AuthenticatedUser,
    purchaseId: string,
  ): Promise<{ purchase: StorePurchase; product: StoreProduct }> {
    const purchase = await this.requireOwn(requester.sub, purchaseId);
    if (purchase.kind !== STORE_PRODUCT_KIND.DOWNLOAD) {
      throw new NotFoundException('Compra não encontrada.');
    }
    if (!isPurchaseActive(purchase)) {
      throw new ForbiddenException(
        'O acesso a esta compra terminou ou foi encerrado.',
      );
    }
    const product = await this.products.findById(purchase.productId);
    if (!product) throw new NotFoundException('Produto não encontrado.');
    return { purchase, product };
  }

  /** Simulação local do pagamento. Só com `DEV_MODE=true`. */
  async mockPay(
    requester: AuthenticatedUser,
    purchaseId: string,
  ): Promise<StorePurchaseView> {
    if (!this.isDevMode()) {
      throw new ForbiddenException('Simulação disponível apenas em DEV_MODE');
    }
    const purchase = await this.requireOwn(requester.sub, purchaseId);
    if (purchase.status !== STORE_PURCHASE_STATUS.PENDING) {
      throw new BadRequestException('Esta compra não está pendente.');
    }
    return toView(await this.markPaid(purchase));
  }

  // ------------------------------------------------------------- internos

  private async markPaid(purchase: StorePurchase): Promise<StorePurchase> {
    if (purchase.status === STORE_PURCHASE_STATUS.PAID) return purchase;
    const paidAt = now();
    const paid = await this.save({
      ...purchase,
      status: STORE_PURCHASE_STATUS.PAID,
      paidAt,
      accessUntil: addDays(paidAt, STORE_ACCESS_DAYS),
    });
    // Nunca lança: e-mail fora do ar não desfaz um pagamento confirmado.
    await this.notifications.storePurchasePaid(paid);
    return paid;
  }

  private async cancel(purchase: StorePurchase): Promise<StorePurchase> {
    return this.save({ ...purchase, status: STORE_PURCHASE_STATUS.CANCELLED });
  }

  private async save(purchase: StorePurchase): Promise<StorePurchase> {
    const saved = { ...purchase, updatedAt: now() };
    await this.purchases.save(saved);
    return saved;
  }

  private newPurchase(
    userId: string,
    product: StoreProduct,
    dto: CreateStorePurchaseDto,
    termsVersion: string,
  ): StorePurchase {
    const at = now();
    return {
      id: this.purchases.newId(),
      userId,
      productId: product.id,
      kind: product.kind,
      ...(product.level ? { level: product.level } : {}),
      ...(product.moduleId ? { moduleId: product.moduleId } : {}),
      titleSnapshot: product.title,
      priceSnapshot: product.price,
      installments: 1,
      method: dto.method,
      status: STORE_PURCHASE_STATUS.PENDING,
      gateway: {},
      termsVersion,
      createdAt: at,
      updatedAt: at,
    };
  }

  /**
   * Assinante não compra o próprio nível (spec 032 decisão 4): ele já tem os
   * módulos dele no plano.
   */
  private assertNotInPlan(buyer: User, product: StoreProduct) {
    if (
      product.kind === STORE_PRODUCT_KIND.MODULE &&
      product.level &&
      buyer.level === product.level &&
      hasPaidAccess(buyer)
    ) {
      throw new ConflictException('Este módulo já faz parte do seu plano.');
    }
  }

  private async currentTermsVersion(): Promise<string> {
    const { publishedVersion } = await this.legal.requirement(STORE_TERMS_TYPE);
    if (!publishedVersion) {
      throw new ServiceUnavailableException(
        'A loja ainda não está aberta para compras.',
      );
    }
    return publishedVersion;
  }

  private async requireBuyer(id: string): Promise<User> {
    const user = await this.users.findById(id);
    if (!user) throw new NotFoundException('Usuário não encontrado.');
    return user;
  }

  private async requireOwn(
    userId: string,
    purchaseId: string,
  ): Promise<StorePurchase> {
    const purchase = await this.purchases.findById(purchaseId);
    // 404 também para a compra de outra pessoa: não confirma que ela existe.
    if (!purchase || purchase.userId !== userId) {
      throw new NotFoundException('Compra não encontrada.');
    }
    return purchase;
  }

  private gatewayFor(purchase: StorePurchase): PaymentGateway {
    return purchase.method === 'PIX' ? this.pix : this.card;
  }

  private isDevMode(): boolean {
    return this.config.get<string>('DEV_MODE') === 'true';
  }
}

export function canWithdraw(
  purchase: Pick<StorePurchase, 'status' | 'paidAt'>,
  at: Date = new Date(),
): boolean {
  return (
    purchase.status === STORE_PURCHASE_STATUS.PAID &&
    !!purchase.paidAt &&
    at.getTime() <= Date.parse(addDays(purchase.paidAt, STORE_WITHDRAWAL_DAYS))
  );
}

export function toView(p: StorePurchase): StorePurchaseView {
  return {
    id: p.id,
    productId: p.productId,
    kind: p.kind,
    title: p.titleSnapshot,
    ...(p.level ? { level: p.level } : {}),
    price: p.priceSnapshot,
    installments: p.installments,
    method: p.method,
    status: p.status,
    ...(p.paidAt ? { paidAt: p.paidAt } : {}),
    ...(p.accessUntil ? { accessUntil: p.accessUntil } : {}),
    active: isPurchaseActive(p),
    ...(p.paidAt
      ? { withdrawUntil: addDays(p.paidAt, STORE_WITHDRAWAL_DAYS) }
      : {}),
    canWithdraw: canWithdraw(p),
    ...(p.refund ? { refund: p.refund } : {}),
    createdAt: p.createdAt,
  };
}

/** CPF e celular antes de chegar ao gateway — sem eles a cobrança é recusada. */
function assertPayable(buyer: User): void {
  const missing: string[] = [];
  if (!buyer.cpf) missing.push('CPF');
  if (!buyer.phone) missing.push('celular');
  if (missing.length === 0) return;
  throw new BadRequestException(
    `Complete seu perfil com ${missing.join(' e ')} antes de comprar.`,
  );
}

function customerOf(buyer: User) {
  return {
    name: buyer.fullName,
    email: buyer.email,
    cellphone: buyer.phone,
    taxId: buyer.cpf,
  };
}

function byNewest(a: StorePurchase, b: StorePurchase): number {
  return b.createdAt.localeCompare(a.createdAt);
}

function formatDate(iso: string): string {
  return iso.slice(0, 10).split('-').reverse().join('/');
}

function now(): string {
  return new Date().toISOString();
}
