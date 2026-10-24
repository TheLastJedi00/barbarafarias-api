import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { JOB_STATUSES, type JobStatus } from '../job.model';

export class CreateJobDto {
  @IsString()
  @IsNotEmpty({ message: 'O título é obrigatório' })
  @MaxLength(120)
  title!: string;

  @IsString()
  @IsNotEmpty({ message: 'A descrição é obrigatória' })
  @MaxLength(5000)
  description!: string;

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  requirements?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  modality?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  workload?: string;

  /** Ausente = abre já. */
  @IsOptional()
  @IsIn(JOB_STATUSES)
  status?: JobStatus;
}

export class UpdateJobDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'O título é obrigatório' })
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'A descrição é obrigatória' })
  @MaxLength(5000)
  description?: string;

  /** String vazia apaga o campo. */
  @IsOptional()
  @IsString()
  @MaxLength(3000)
  requirements?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  modality?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  workload?: string;

  @IsOptional()
  @IsIn(JOB_STATUSES)
  status?: JobStatus;
}
