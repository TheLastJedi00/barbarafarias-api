import { IsBoolean } from 'class-validator';

export class PhoneVisibilityDto {
  @IsBoolean({ message: 'visible deve ser booleano' })
  visible!: boolean;
}
