import { IsString } from 'class-validator';

export class UpsertPrincipalDto {
  @IsString()
  prompt!: string;
}
