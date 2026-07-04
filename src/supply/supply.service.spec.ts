import { InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { SupplyService } from './supply.service';

const VALID_MODULES = [{ title: 'Módulo 1', text: 'Intro', topics: [] }];

function makeStudent() {
  return {
    fullName: 'Ana Maria',
    objective: 'Viajar',
    prognosis: 'Bom',
  };
}

describe('SupplyService.createSupply', () => {
  let service: SupplyService;
  let supplyRepository: { save: jest.Mock };
  let userService: { findById: jest.Mock };
  let promptService: { getPromptByLevel: jest.Mock };
  let genAi: { generateContent: jest.Mock };

  const dto = { studentId: 's1', level: 'A1' } as any;

  beforeEach(() => {
    supplyRepository = { save: jest.fn().mockResolvedValue('s1_A1') };
    userService = { findById: jest.fn().mockResolvedValue(makeStudent()) };
    promptService = {
      getPromptByLevel: jest.fn().mockResolvedValue({ prompt: 'Gere módulos' }),
    };
    genAi = {
      generateContent: jest.fn().mockResolvedValue(JSON.stringify(VALID_MODULES)),
    };
    service = new SupplyService(
      supplyRepository as any,
      userService as any,
      promptService as any,
      genAi as any,
    );
  });

  it('cria e persiste o supply no caminho feliz', async () => {
    const result = await service.createSupply(dto);
    expect(result).toEqual(dto);
    expect(supplyRepository.save).toHaveBeenCalledTimes(1);
  });

  it('propaga NotFound quando o aluno não existe', async () => {
    userService.findById.mockResolvedValue(null);
    await expect(service.createSupply(dto)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(supplyRepository.save).not.toHaveBeenCalled();
  });

  it('propaga o erro quando a gravação falha (save deve ser aguardado)', async () => {
    supplyRepository.save.mockRejectedValue(new Error('firestore down'));
    await expect(service.createSupply(dto)).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });

  it('lança 500 quando a IA retorna um formato inválido', async () => {
    genAi.generateContent.mockResolvedValue('não é json');
    await expect(service.createSupply(dto)).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
    expect(supplyRepository.save).not.toHaveBeenCalled();
  });
});
