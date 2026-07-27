import { IsBoolean } from 'class-validator';

export class AttendanceDto {
  @IsBoolean({ message: 'present deve ser booleano' })
  present!: boolean;
}
