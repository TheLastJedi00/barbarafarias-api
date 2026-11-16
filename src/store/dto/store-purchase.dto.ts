import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { STORE_MAX_INSTALLMENTS } from '../store-product.model';
import type { StorePaymentMethod } from '../store-purchase.model';

const METHODS: StorePaymentMethod[] = ['PIX', 'CREDIT_CARD'];

/**
 * Começar uma compra. `termsVersion` é a versão do termo de compra que a tela
 * mostrou: se a gerente publicou outra no meio, a compra é recusada e o
 * comprador relê (spec 032 §7).
 */
export class CreateStorePurchaseDto {
  @IsString()
  @IsNotEmpty()
  productId!: string;

  @IsIn(METHODS)
  method!: StorePaymentMethod;

  @IsString()
  @IsNotEmpty({ message: 'É preciso aceitar o termo de compra' })
  @MaxLength(20)
  termsVersion!: string;
}

/**
 * Cartão tokenizado no navegador (Card Payment Brick). PAN e CVC nunca passam
 * por aqui. As parcelas são escolha do comprador — com juros dele —, mas o
 * teto é do produto e quem confere é o service.
 */
export class PayStorePurchaseCardDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  token!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  paymentMethodId!: string;

  @IsInt()
  @Min(1)
  @Max(STORE_MAX_INSTALLMENTS)
  installments!: number;
}

export class RefundStorePurchaseDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
