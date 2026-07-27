import { IsBoolean } from 'class-validator';

export class SetActiveDto {
  @IsBoolean({ message: 'active deve ser booleano' })
  active!: boolean;
}
