import { Module } from '@nestjs/common';
import { ContractRepository } from './contract.repository';
import { ContractService } from './contract.service';
import { ContractController } from './contract.controller';

/** Contratos em PDF do aluno (spec 036 §6). */
@Module({
  controllers: [ContractController],
  providers: [ContractRepository, ContractService],
  exports: [ContractService],
})
export class ContractModule {}
