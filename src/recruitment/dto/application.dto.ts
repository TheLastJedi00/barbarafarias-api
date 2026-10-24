import { IsIn } from 'class-validator';
import {
  APPLICATION_STATUSES,
  type ApplicationStatus,
} from '../application.model';

export class UpdateApplicationStatusDto {
  @IsIn(APPLICATION_STATUSES, { message: 'Etapa inválida' })
  status!: ApplicationStatus;
}
