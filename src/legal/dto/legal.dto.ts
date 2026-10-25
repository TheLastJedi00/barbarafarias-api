import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { LEGAL_DOCUMENT_TYPES, type LegalDocumentType } from '../legal.model';

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

export class AcceptLegalDto {
  /** Só os tipos: a versão aceita é a vigente, decidida no servidor. */
  @IsArray()
  @ArrayNotEmpty({ message: 'Informe o documento aceito' })
  @ArrayMaxSize(3)
  @IsIn(LEGAL_DOCUMENT_TYPES, { each: true, message: 'Documento inválido' })
  types!: LegalDocumentType[];
}
