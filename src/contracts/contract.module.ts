import { Module } from '@nestjs/common';
import { ContractRepository } from './contract.repository';
import { ContractService } from './contract.service';

/** Contratos em PDF do aluno (spec 036 §6). */
@Module({
  providers: [ContractRepository, ContractService],
  exports: [ContractService],
})
export class ContractModule {}
