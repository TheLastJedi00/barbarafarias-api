import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class RefreshDto {
  /**
   * **Opcional de propósito, e os dois lados dependem disso** (spec 021 §7.2).
   *
   * O refresh token passou a viajar em cookie `httpOnly`, mas o `ValidationPipe`
   * global roda com `whitelist` **e** `forbidNonWhitelisted`, então o campo corta
   * nas duas direções: obrigatório, derruba com 400 o front novo (que manda
   * corpo vazio); removido, derruba com 400 o front antigo (que ainda manda o
   * campo). Nas duas o sintoma é logout geral.
   *
   * Também é por aqui que o `bf.refresh` que ficou no `localStorage` das pessoas
   * é convertido em cookie, uma única vez, na primeira carga do front novo.
   *
   * Sai na Task 8, uma release depois da Fase 2 estar em produção.
   */
  @IsOptional()
  @IsString()
  @MinLength(1)
  refresh_token?: string;
}

export class ForgotPasswordDto {
  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  email!: string;
}
