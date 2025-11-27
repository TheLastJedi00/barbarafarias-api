import { Test, TestingModule } from '@nestjs/testing';
import { SupplyService } from './supply.service';
import {
  ConflictException,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { Supply } from '../domain/models/supply.model';
import { Level } from '../domain/types/student.level';
import { SupplyInfoDto } from './dtos/SupplyInfo.dto';
import { Reflector } from '@nestjs/core';

// 1. Mocks
const mockSupplyRepo = {
  findByStudentAndLevel: jest.fn(),
  save: jest.fn(),
};

const mockUserRepo = {
  findById: jest.fn(),
};

const mockPromptRepo = {
  getPromptByLevel: jest.fn(),
};

const mockAiService = {
  generateContent: jest.fn(),
};

describe('SupplyService', () => {
  let service: SupplyService;
  // 2. Setup antes de cada teste
  beforeEach(async () => {
    jest.clearAllMocks(); // Limpa contadores de chamadas anteriores

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SupplyService,
        // 3. Injeção de Dependência Simulada
        { provide: 'SupplyRepository', useValue: mockSupplyRepo },
        { provide: 'UserRepository', useValue: mockUserRepo },
        { provide: 'PromptRepository', useValue: mockPromptRepo },
        { provide: 'GenerativeAIService', useValue: mockAiService },
      ],
    }).compile();

    service = module.get<SupplyService>(SupplyService);
  });

  it('deve estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('generateSupply', () => {
    // Dados de teste

    const dto = new SupplyInfoDto('Leno', 'A1' as unknown as Level);
    const mockUser = {
      getFullName: () => 'Leno Borges',
      getObjectives: () => 'Fluency',
      getPrognosis: () => 'Good',
    };
    const mockPrompt = { prompt: 'Act as a teacher...' };
    const mockModules = [{ title: 'Module 1', topics: [] }];

    it('deve gerar e salvar novo conteúdo com sucesso (Caminho Feliz)', async () => {
      const mockPromptData = { prompt: 'Teacher Prompt' };

      // Arrange
      mockUserRepo.findById.mockResolvedValue(mockUser);
      mockPromptRepo.getPromptByLevel.mockResolvedValue({
        prompt: mockPromptData.prompt,
      });
      mockAiService.generateContent.mockResolvedValue([{ title: 'Module 1' }]);

      // Act
      await service.createSupply(dto);

      // Assert
      expect(mockPromptRepo.getPromptByLevel).toHaveBeenCalledWith('A1');
      expect(mockAiService.generateContent).toHaveBeenCalledWith(
        mockPromptData.prompt,
        expect.any(Object),
      );

      // Verifica se salvou uma instância da classe Supply
      expect(mockSupplyRepo.save).toHaveBeenCalledWith(expect.any(Object));
    });

    it('deve ignorar conflito se force=true (Upsert)', async () => {
      // Arrange
      const forceDto = { ...dto, force: true };
      mockSupplyRepo.findByStudentAndLevel.mockResolvedValue({
        id: 'supply_existente',
      });
      mockUserRepo.findById.mockResolvedValue(mockUser);
      mockPromptRepo.getPromptByLevel.mockResolvedValue(mockPrompt);
      mockAiService.generateContent.mockResolvedValue(mockModules);

      // Act
      await service.createSupply(forceDto);

      // Assert
      expect(mockAiService.generateContent).toHaveBeenCalled(); // Chamou a IA
      expect(mockSupplyRepo.save).toHaveBeenCalled(); // Salvou (sobrescreveu)
    });

    it('deve lançar NotFoundException se o aluno não existir', async () => {
      mockSupplyRepo.findByStudentAndLevel.mockResolvedValue(null);
      mockUserRepo.findById.mockResolvedValue(null); // Aluno não achado

      await expect(service.createSupply(dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('deve lançar InternalServerErrorException se o prompt não existir', async () => {
      mockSupplyRepo.findByStudentAndLevel.mockResolvedValue(null);
      mockUserRepo.findById.mockResolvedValue(mockUser);
      mockPromptRepo.getPromptByLevel.mockResolvedValue(null); // Prompt sumiu

      await expect(service.createSupply(dto)).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });
});
