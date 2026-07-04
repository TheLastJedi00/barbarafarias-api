import { Injectable } from '@nestjs/common';
import { TurmaRepository } from './turma.repository';
import { CreateTurmaDto } from './dto/create-turma.dto';
import { UpdateTurmaDto } from './dto/update-turma.dto';
import { Turma } from './turma.entity';

@Injectable()
export class TurmaService {
  constructor(private readonly turmaRepository: TurmaRepository) {}

  findAll(): Promise<Turma[]> {
    return this.turmaRepository.findAll();
  }

  create(dto: CreateTurmaDto): Promise<Turma> {
    return this.turmaRepository.create(dto);
  }

  update(id: string, dto: UpdateTurmaDto): Promise<void> {
    return this.turmaRepository.update(id, dto);
  }

  delete(id: string): Promise<void> {
    return this.turmaRepository.delete(id);
  }
}
