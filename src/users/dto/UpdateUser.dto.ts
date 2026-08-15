import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
} from 'class-validator';
import { LEVELS } from '../../types/student.level';

export class UpdateUserDto {
  @IsString()
  @IsOptional()
  fullName?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  /*
   * `isPaying` **não é campo desta rota** (spec 025).
   *
   * Ele esteve aqui e não funcionava: quando o aluno tinha assinatura, o valor
   * era descartado em silêncio, a resposta vinha 200 e a tela dizia "Em dia"
   * sobre algo que nunca foi gravado. Com `forbidNonWhitelisted`, mandá-lo
   * agora recusa o pedido — que é o certo: acesso passa por
   * `POST /users/:id/access-grant`, e falhar alto é melhor que fingir sucesso.
   */

  @IsBoolean()
  @IsOptional()
  isTeacher?: boolean;

  /** Mesmo enum fechado do cadastro (spec 018 Task 106). */
  @IsIn(LEVELS, { message: `Nível deve ser um de: ${LEVELS.join(', ')}` })
  @IsOptional()
  level?: string;

  @IsString()
  @IsOptional()
  objective?: string;

  @IsString()
  @IsOptional()
  prognosis?: string;

  @IsString()
  @IsOptional()
  profileImageUrl?: string;
}
