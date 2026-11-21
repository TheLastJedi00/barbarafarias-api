import { Injectable, Logger } from '@nestjs/common';
import { ContractRepository } from './contract.repository';
import { Contract } from './contract.entity';

/** O que o fluxo de compra entrega para virar contrato. */
export type ContractInput = Omit<Contract, 'id' | 'createdAt'>;

/**
 * Contratos do aluno (spec 036 §6). Os fluxos de compra chamam `record` no
 * mesmo passo do aceite; a leitura e o PDF ficam no controller.
 */
@Injectable()
export class ContractService {
  private readonly logger = new Logger(ContractService.name);

  constructor(private readonly contracts: ContractRepository) {}

  record(input: ContractInput): Promise<Contract> {
    return this.contracts.create(new Contract(input));
  }

  /**
   * Grava sem derrubar a compra. O aceite em si já está registrado pelo
   * fluxo dono (aceite do plano, compra da loja); perder a cobrança porque o
   * PDF não foi gravado trocaria um problema pequeno por um grande. A falha
   * vai para o log e o backfill refaz.
   */
  async recordSafely(input: ContractInput): Promise<Contract | null> {
    try {
      return await this.record(input);
    } catch (error) {
      this.logger.error(
        `Contrato ${input.kind}/${input.refId} não gravado: ${(error as Error).message}`,
      );
      return null;
    }
  }

  findByStudent(studentId: string): Promise<Contract[]> {
    return this.contracts.findByStudent(studentId);
  }

  findById(id: string): Promise<Contract | null> {
    return this.contracts.findById(id);
  }
}
