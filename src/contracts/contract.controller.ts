import {
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { Roles } from '../decorators/roles.decorator';
import { ROLES } from '../types/role';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../decorators/current-user.decorator';
import { ContractService } from './contract.service';
import { Contract } from './contract.entity';
import { renderContractPdf } from './contract-pdf';

/** O contrato na lista: sem as cláusulas, que só o PDF precisa. */
export type ContractSummary = Omit<Contract, 'clauses' | 'summary'>;

function summaryOf(contract: Contract): ContractSummary {
  const { clauses: _clauses, summary: _summary, ...rest } = contract;
  void _clauses;
  void _summary;
  return rest;
}

/**
 * Contratos em PDF (spec 036 §6). Sem `@RequiresActivePlan`: quem desistiu ou
 * está devendo continua com direito ao próprio contrato — é justamente quando
 * mais precisa dele.
 */
@Controller('contracts')
export class ContractController {
  constructor(private readonly contracts: ContractService) {}

  @Get('me')
  @Roles(ROLES.STUDENT)
  async mine(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ContractSummary[]> {
    return (await this.contracts.findByStudent(user.sub)).map(summaryOf);
  }

  @Get('me/:id/pdf')
  @Roles(ROLES.STUDENT)
  @Header('Cache-Control', 'private, no-store')
  async myPdf(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    return this.pdfOf(await this.ownedBy(id, user.sub), res);
  }

  @Get('student/:studentId')
  @Roles(ROLES.MANAGER)
  async ofStudent(
    @Param('studentId') studentId: string,
  ): Promise<ContractSummary[]> {
    return (await this.contracts.findByStudent(studentId)).map(summaryOf);
  }

  @Get('student/:studentId/:id/pdf')
  @Roles(ROLES.MANAGER)
  @Header('Cache-Control', 'private, no-store')
  async studentPdf(
    @Param('studentId') studentId: string,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    return this.pdfOf(await this.ownedBy(id, studentId), res);
  }

  /** 404, não 403, para contrato de outra pessoa: 403 diria que ele existe. */
  private async ownedBy(id: string, studentId: string): Promise<Contract> {
    const contract = await this.contracts.findById(id);
    if (!contract || contract.studentId !== studentId) {
      throw new NotFoundException('Contrato não encontrado.');
    }
    return contract;
  }

  private async pdfOf(
    contract: Contract,
    res: Pick<Response, 'setHeader'>,
  ): Promise<StreamableFile> {
    const bytes = await renderContractPdf(contract);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="contrato-${contract.id}.pdf"`,
    );
    return new StreamableFile(Buffer.from(bytes), {
      type: 'application/pdf',
      length: bytes.length,
    });
  }
}
