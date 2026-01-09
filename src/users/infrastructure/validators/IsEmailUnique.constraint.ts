import { Inject, Injectable } from '@nestjs/common';
import {
  ValidationArguments,
  Validator,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import type { UserRepository } from 'src/users/domain/user.repository.port';

@ValidatorConstraint({ name: 'IsEmailUnique', async: true })
@Injectable()
export class IsEmailUnique implements ValidatorConstraintInterface {
  constructor(
    @Inject('UserRepository') private userRepository: UserRepository,
  ) {}

  async validate(
    email: string,
    validationArguments?: ValidationArguments,
  ): Promise<boolean> {
    const user = await this.userRepository.findByEmail(email);
    return user == null;
  }
  defaultMessage?(args: ValidationArguments): string {
    return `O email ${args.value} já está em uso`;
  }
}
