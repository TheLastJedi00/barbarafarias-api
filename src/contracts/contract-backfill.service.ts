import { Injectable, Logger } from '@nestjs/common';
import { PlanAcceptanceRepository } from '../subscriptions/plan-acceptance.repository';
import { StorePurchaseRepository } from '../store/store-purchase.repository';
import { STORE_TERMS_TYPE } from '../store/store-purchase.service';
import { STORE_ACCESS_DAYS } from '../store/store-product.model';
import { UserRepository } from '../users/user.repository';
import { LegalService } from '../legal/legal.service';
import { TERMS_VERSION, buildTerms } from '../subscriptions/plan-terms';
import {
  isTierPlan,
  type LegacyPlan,
} from '../subscriptions/subscription.entity';
import type { PlanAcceptance } from '../subscriptions/plan-acceptance.entity';
import type { StorePurchase } from '../store/store-purchase.model';
import { ContractService, type ContractInput } from './contract.service';
import { contractIdOf, type ContractKind } from './contract.entity';
import { clausesFromMarkdown } from './markdown-clauses';

export interface BackfillReport {
  created: number;
  alreadyExisted: number;
  skipped: { kind: ContractKind; refId: string; reason: string }[];
}

const brl = (value: number) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Contratos dos aceites anteriores à spec 036 (§6). Gera **só o que dá para
 * reconstruir com exatidão**:
 *
 * - compra da loja: o termo é uma versão publicada do Jurídico, imutável;
 * - plano antigo cuja versão é a vigente no código: o texto sai do catálogo
 *   fixo daquela versão.
 *
 * O resto vai para o relatório. Um PDF com o texto de hoje no lugar do aceito
 * seria um documento falso, e é pior que nenhum. Idempotente: contrato que já
 * existe é contado e não é tocado.
 */
@Injectable()
export class ContractBackfillService {
  private readonly logger = new Logger(ContractBackfillService.name);

  constructor(
    private readonly acceptances: PlanAcceptanceRepository,
    private readonly purchases: StorePurchaseRepository,
    private readonly users: UserRepository,
    private readonly legal: LegalService,
    private readonly contracts: ContractService,
  ) {}

  async run(): Promise<BackfillReport> {
    const report: BackfillReport = {
      created: 0,
      alreadyExisted: 0,
      skipped: [],
    };

    for (const aceite of await this.acceptances.findAll()) {
      await this.apply(report, 'PLAN', aceite.id, () =>
        Promise.resolve(this.fromPlan(aceite)),
      );
    }
    for (const compra of await this.purchases.findAll()) {
      await this.apply(report, 'STORE', compra.id, () =>
        this.fromStore(compra),
      );
    }

    this.logger.log(
      `Backfill de contratos: ${report.created} criados, ${report.alreadyExisted} já existiam, ${report.skipped.length} sem reconstrução exata.`,
    );
    return report;
  }

  private async apply(
    report: BackfillReport,
    kind: ContractKind,
    refId: string,
    build: () => Promise<ContractInput | string>,
  ): Promise<void> {
    if (await this.contracts.findById(contractIdOf(kind, refId))) {
      report.alreadyExisted++;
      return;
    }
    try {
      const input = await build();
      if (typeof input === 'string') {
        report.skipped.push({ kind, refId, reason: input });
        return;
      }
      await this.contracts.record(input);
      report.created++;
    } catch (error) {
      report.skipped.push({ kind, refId, reason: (error as Error).message });
    }
  }

  /** Devolve o contrato, ou o motivo de não dar para reconstruir. */
  private fromPlan(aceite: PlanAcceptance): ContractInput | string {
    if (isTierPlan(aceite.plan)) {
      return 'Plano por tier: o texto leva o preço do dia da contratação, que o aceite não guarda.';
    }
    if (aceite.termsVersion !== TERMS_VERSION) {
      return `Versão ${aceite.termsVersion} não é a vigente no código (${TERMS_VERSION}): o texto dela não existe mais.`;
    }
    const terms = buildTerms(aceite.plan as LegacyPlan);
    return {
      studentId: aceite.studentId,
      studentName: aceite.studentName,
      studentEmail: aceite.studentEmail,
      kind: 'PLAN',
      refId: aceite.id,
      title: `Plano — ${terms.planLabel}`,
      termsVersion: terms.version,
      summary: terms.summary,
      clauses: terms.clauses,
      deal: [
        { label: 'Plano', value: aceite.planLabel },
        {
          label: 'Valor',
          value: `${aceite.installments}x de ${brl(aceite.installmentAmount)} (total ${brl(aceite.totalAmount)})`,
        },
        ...(aceite.couponCode
          ? [{ label: 'Cupom', value: aceite.couponCode }]
          : []),
      ],
      acceptedAt: aceite.acceptedAt,
    };
  }

  private async fromStore(
    compra: StorePurchase,
  ): Promise<ContractInput | string> {
    const buyer = await this.users.findById(compra.userId);
    if (!buyer) return 'Comprador não encontrado.';
    const terms = await this.legal.getVersion(
      STORE_TERMS_TYPE,
      compra.termsVersion,
    );
    return {
      studentId: compra.userId,
      studentName: buyer.fullName,
      studentEmail: buyer.email,
      kind: 'STORE',
      refId: compra.id,
      title: `Compra — ${compra.titleSnapshot}`,
      termsVersion: compra.termsVersion,
      summary: terms.title,
      clauses: clausesFromMarkdown(terms.markdown),
      deal: [
        { label: 'Produto', value: compra.titleSnapshot },
        { label: 'Valor', value: brl(compra.priceSnapshot) },
        {
          label: 'Forma de pagamento',
          value: compra.method === 'PIX' ? 'PIX' : 'Cartão de crédito',
        },
        {
          label: 'Acesso',
          value: `${STORE_ACCESS_DAYS} dias a partir do pagamento`,
        },
      ],
      acceptedAt: compra.createdAt,
    };
  }
}
