import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { Roles } from '../decorators/roles.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../decorators/current-user.decorator';
import { ROLES } from '../types/role';
import {
  CreateStorePurchaseDto,
  PayStorePurchaseCardDto,
  RefundStorePurchaseDto,
} from './dto/store-purchase.dto';
import { StorePurchaseService } from './store-purchase.service';

/**
 * Compras do aluno na loja (spec 032 §7). Nenhuma rota recebe o id de outra
 * pessoa: o dono é sempre o `sub` do token, e compra alheia responde 404.
 *
 * Sem `@RequiresActivePlan`: comprar módulo avulso é justamente o caminho de
 * quem não tem plano.
 */
@Controller('store/purchases')
@Roles(ROLES.STUDENT)
export class StorePurchaseController {
  constructor(private readonly service: StorePurchaseService) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateStorePurchaseDto,
  ) {
    return this.service.create(user, dto);
  }

  @Get('me')
  listMine(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listMine(user);
  }

  @Post(':id/card')
  @HttpCode(200)
  payWithCard(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: PayStorePurchaseCardDto,
  ) {
    return this.service.payWithCard(user, id, dto);
  }

  /** Fim do desafio 3DS: relê a order em vez de esperar o webhook. */
  @Post(':id/card/confirm')
  @HttpCode(200)
  confirmCard(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.confirmCard(user, id);
  }

  /** Desistência em até 7 dias do pagamento (CDC art. 49). */
  @Post(':id/withdraw')
  @HttpCode(200)
  withdraw(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.withdraw(user, id);
  }

  /** **Só com `DEV_MODE=true`**: simula a confirmação do pagamento. */
  @Post(':id/mock-pay')
  @HttpCode(200)
  mockPay(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.mockPay(user, id);
  }
}

/** Vendas da loja, para a gerente (spec 032 §9). */
@Controller('store/admin/purchases')
@Roles(ROLES.MANAGER)
export class StoreAdminPurchaseController {
  constructor(private readonly service: StorePurchaseService) {}

  @Get()
  list() {
    return this.service.listAll();
  }

  @Post(':id/refund')
  @HttpCode(200)
  refund(@Param('id') id: string, @Body() dto: RefundStorePurchaseDto) {
    return this.service.adminRefund(id, dto);
  }
}
