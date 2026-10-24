import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class SaveDraftDto {
  @IsString()
  @IsNotEmpty({ message: 'O título é obrigatório' })
  @MaxLength(200)
  title!: string;

  /** Texto em Markdown. 200 mil caracteres cobrem com folga um termo longo. */
  @IsString()
  @MaxLength(200_000)
  markdown!: string;
}

export class PublishDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'Vigência no formato AAAA-MM-DD',
  })
  effectiveDate!: string;

  @IsBoolean()
  requiresReacceptance!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  changeNote?: string;
}
