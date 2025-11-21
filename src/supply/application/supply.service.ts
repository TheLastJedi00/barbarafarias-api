import { Inject } from "@nestjs/common";
import type { SupplyRepository } from "../domain/supply.repository.port";
import { StudentSupplyDto } from "./dtos/CreateSupplie.dto";
import { Supply } from "../domain/supply.model";

export class SupplyService {
    constructor(@Inject('SupplyRepository') private supplyRepository: SupplyRepository) {}

    async createSupply(dto: StudentSupplyDto): Promise<void> {
        const supply = new Supply(
            dto.studentId,
            dto.level,
            dto.content
        );
        return this.supplyRepository.save(supply);
    }

    async findSuppliesByStudentId(studentId: string): Promise<Supply[]> {
        return this.supplyRepository.findByStudentId(studentId);
    }

    async findSupplyByStudentAndLevel(studentId: string, level: string): Promise<Supply | null> {
        return this.supplyRepository.findByStudentAndLevel(studentId, level as any);
    }

    async updateSupply(dto: StudentSupplyDto): Promise<void> {
        const supply = new Supply(
            dto.studentId,
            dto.level,
            dto.content
        );
        return this.supplyRepository.update(supply);
    }
    async deleteSupply(studentId: string, level: string): Promise<void> {
        return this.supplyRepository.delete(studentId, level as any);
    }

}