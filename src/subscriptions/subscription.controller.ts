import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { SubscriptionService } from './subscription.service';
import {
  CardPaymentDto,
  CardPaymentResponseDto,
  ChangePaymentMethodDto,
  ChoosePlanDto,
  ChoosePlanResponseDto,
  SubscriptionDto,
  ValidateCouponQueryDto,
} from './dto/subscription.dto';
import { Charge, PLAN_CONFIGS } from './subscription.entity';
import type {
  LegacyPlan,
  PlanConfig,
  SubscriptionPlan,
} from './subscription.entity';
import { buildTerms, buildTierTerms } from './plan-terms';
import { PlanTierService } from '../plan-tiers/plan-tier.service';
import { isPlanTierId } from '../plan-tiers/plan-tier.model';
import type { PlanTierId } from '../plan-tiers/plan-tier.model';
import { TIER_PLANS } from './subscription.entity';
import type { TierPlan } from './subscription.entity';
import type { PlanAcceptanceView } from './plan-acceptance.entity';
import { Roles } from '../decorators/roles.decorator';
import { Public } from '../decorators/public.decorator';
import { CurrentUser } from '../decorators/current-user.decorator';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';
import { ROLES } from '../types/role';

/**
 * Painel financeiro do aluno (spec 012 RF1–RF5).
 *
 * Toda rota `me` opera sobre o `sub` do token — o aluno nunca informa o
 * próprio id, então não há como pedir a assinatura de outra pessoa. A consulta
 * por id existe só para a gerente.
 */
@Controller('subscriptions')
export class SubscriptionController {
  constructor(
    private readonly service: SubscriptionService,
    private readonly planTiers: PlanTierService,
  ) {}

  /**
   * Catálogo dos planos: alimenta o seletor (RF2) e, desde a spec 034, a
   * landing da Academy, que mostra os preços antes do login. Por isso é
   * público — é o mesmo texto de qualquer página de preços, sem dado de
   * ninguém. O contrato (`plans/:plan/terms`) continua fechado.
   */
  @Public()
  @Get('plans')
  plans(): PlanConfig[] {
    return Object.values(PLAN_CONFIGS);
  }

  /**
   * O contrato de um plano, montado do catálogo (§7.3).
   *
   * O aluno precisa ler o texto **antes** de pagar, e a `termsVersion` que ele
   * devolve em `POST me` é a que vem daqui — é o que garante que o que ficou
   * registrado é o que estava na tela.
   *
   * A gerente lê a mesma rota: a tela de contratos (§7.4) mostra o texto de
   * cada aceite, e sem ela o aceite vira uma linha sem o que foi aceito. Não é
   * dado de ninguém — é o catálogo, o mesmo texto que qualquer visitante vê
   * antes de contratar.
   */
  @Get('plans/:plan/terms')
  @Roles(ROLES.STUDENT, ROLES.MANAGER)
  terms(@Param('plan') plan: SubscriptionPlan) {
    if (!(plan in PLAN_CONFIGS)) {
      throw new BadRequestException('Plano inválido');
    }
    return buildTerms(plan as LegacyPlan);
  }

  /**
   * O contrato de um tier num dos dois jeitos de comprar (spec 035), com o
   * preço que vale agora — o mesmo que a contratação vai congelar. Mesmo
   * acesso do contrato dos planos antigos: o aluno lê antes de pagar, a
   * gerente lê na tela de contratos.
   */
  @Get('tiers/:tierId/terms')
  @Roles(ROLES.STUDENT, ROLES.MANAGER)
  async tierTerms(
    @Param('tierId') tierId: PlanTierId,
    @Query('plan') plan: TierPlan,
  ) {
    if (!isPlanTierId(tierId) || !Object.values(TIER_PLANS).includes(plan)) {
      throw new BadRequestException('Plano inválido');
    }
    const tier = await this.planTiers.getEffective(tierId);
    try {
      return buildTierTerms(tier, plan);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  /**
   * Os aceites registrados, só para a gerente (§7.4). É consulta: não há rota
   * de edição nem de remoção, e a ausência delas é o desenho — um registro
   * probatório que pode ser editado não prova nada.
   */
  @Get('acceptances')
  @Roles(ROLES.MANAGER)
  acceptances(): Promise<PlanAcceptanceView[]> {
    return this.service.listAcceptances();
  }

  /**
   * Confere um cupom antes de contratar (RF16). Fica antes das paramétricas e
   * devolve 400 quando o código não existe ou está desativado.
   */
  @Get('coupons/:code')
  @Roles(ROLES.STUDENT)
  validateCoupon(
    @Param('code') code: string,
    @Query() query: ValidateCouponQueryDto,
  ) {
    return this.service.validateCoupon(code, query);
  }

  @Get('me')
  @Roles(ROLES.STUDENT)
  mine(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SubscriptionDto | null> {
    return this.service.getSubscription(user.sub);
  }

  @Post('me')
  @Roles(ROLES.STUDENT)
  choosePlan(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChoosePlanDto,
  ): Promise<ChoosePlanResponseDto> {
    return this.service.choosePlan(user.sub, dto);
  }

  /**
   * Segundo passo da contratação por cartão: o token que o formulário gerou no
   * navegador. Separado de `POST me` porque o token só existe **depois** de o
   * aluno digitar o cartão, que é depois daquela resposta.
   */
  @Post('me/card')
  @Roles(ROLES.STUDENT)
  payWithCard(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CardPaymentDto,
  ): Promise<CardPaymentResponseDto> {
    return this.service.payWithCard(user.sub, dto);
  }

  /**
   * Relê a cobrança de cartão em aberto — o front chama ao fim do desafio 3DS.
   *
   * Separada de `me/card` porque não cria cobrança nenhuma: só consulta e, se
   * o dinheiro entrou, confirma. Repetir é inofensivo.
   */
  @Post('me/card/refresh')
  @Roles(ROLES.STUDENT)
  refreshCardPayment(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CardPaymentResponseDto> {
    return this.service.refreshCardPayment(user.sub);
  }

  /**
   * Descarta a tentativa em aberto e libera uma nova (spec 023 P2).
   *
   * A saída do beco em que um desafio 3DS não concluído trancava a parcela sem
   * prazo. É `POST` e não `DELETE` porque não apaga nada: a cobrança anterior
   * fica registrada como abandonada, e é ela que impede a cobrança dupla se o
   * desafio antigo for concluído depois.
   */
  @Post('me/card/restart')
  @Roles(ROLES.STUDENT)
  restartCardPayment(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CardPaymentResponseDto> {
    return this.service.restartCardPayment(user.sub);
  }

  @Patch('me/payment-method')
  @Roles(ROLES.STUDENT)
  changePaymentMethod(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePaymentMethodDto,
  ): Promise<ChoosePlanResponseDto> {
    return this.service.changePaymentMethod(user.sub, dto);
  }

  @Post('me/cancel')
  @Roles(ROLES.STUDENT)
  cancel(@CurrentUser() user: AuthenticatedUser): Promise<SubscriptionDto> {
    return this.service.cancelSubscription(user.sub);
  }

  /**
   * Desistência do **pacote** do tier em até 7 dias do pagamento (CDC art.
   * 49): estorna tudo e encerra o acesso. A assinatura desiste por
   * `me/cancel`, que já sabe a janela dela (spec 035 §4/§5).
   */
  @Post('me/withdraw')
  @Roles(ROLES.STUDENT)
  withdraw(@CurrentUser() user: AuthenticatedUser): Promise<SubscriptionDto> {
    return this.service.withdraw(user.sub);
  }

  @Get('me/charges')
  @Roles(ROLES.STUDENT)
  charges(@CurrentUser() user: AuthenticatedUser): Promise<Charge[]> {
    return this.service.getUpcomingCharges(user.sub);
  }

  /**
   * Simula a confirmação do PIX no ambiente local. Fica antes da rota
   * paramétrica e é barrada pelo próprio service quando `DEV_MODE` não está
   * ligado — o guard de papel sozinho não impediria o uso em produção.
   */
  @Post('dev/mock-pay')
  @Roles(ROLES.STUDENT)
  mockPay(@CurrentUser() user: AuthenticatedUser): Promise<SubscriptionDto> {
    return this.service.mockPay(user.sub);
  }

  /** A gerente inspeciona o plano de qualquer aluno pelo painel financeiro. */
  @Get(':studentId')
  @Roles(ROLES.MANAGER)
  byStudent(
    @Param('studentId') studentId: string,
  ): Promise<SubscriptionDto | null> {
    return this.service.getSubscription(studentId);
  }
}
