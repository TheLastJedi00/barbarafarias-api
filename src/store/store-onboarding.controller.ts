import { Body, Controller, Put } from '@nestjs/common';
import { Roles } from '../decorators/roles.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../decorators/current-user.decorator';
import { ROLES } from '../types/role';
import { CareerProfileDto } from '../users/dto/CareerProfile.dto';
import { UserService } from '../users/user.service';

/**
 * Questionário que o comprador responde depois de pagar (spec 033). Grava no
 * usuário (`careerProfile`); a geração lê as respostas atuais.
 */
@Controller('store')
export class StoreOnboardingController {
  constructor(private readonly users: UserService) {}

  @Put('onboarding')
  @Roles(ROLES.STUDENT)
  save(@CurrentUser() user: AuthenticatedUser, @Body() dto: CareerProfileDto) {
    return this.users.setCareerProfile(user.sub, dto);
  }
}
