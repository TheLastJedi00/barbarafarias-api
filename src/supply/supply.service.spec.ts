import { Test, TestingModule } from '@nestjs/testing';
import { SupplyService } from './supply.service';
import { SupplyRepository } from './supply.repository';
import { UserService } from '../users/user.service';
import { PromptService } from '../prompts/prompt.service';
import { GeminiProvider } from './gemini/gemini.service';
import { NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { SupplyInfoDto } from './dtos/SupplyInfo.dto';
import { Supply } from './supply.model';

jest.mock('uuid', () => ({
  v4: jest.fn(),
}));

describe('SupplyService', () => {
  let service: SupplyService;
  let supplyRepository: jest.Mocked<SupplyRepository>;
  let userService: jest.Mocked<UserService>;
  let promptService: jest.Mocked<PromptService>;
  let genAi: jest.Mocked<GeminiProvider>;

  beforeEach(async () => {
    const mockSupplyRepository = {
      save: jest.fn(),
      findByStudentId: jest.fn(),
      findByStudentAndLevel: jest.fn(),
      delete: jest.fn(),
    };
    const mockUserService = {
      findById: jest.fn(),
    };
    const mockPromptService = {
      getPromptByLevel: jest.fn(),
    };
    const mockGeminiProvider = {
      generateContent: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SupplyService,
        { provide: SupplyRepository, useValue: mockSupplyRepository },
        { provide: UserService, useValue: mockUserService },
        { provide: PromptService, useValue: mockPromptService },
        { provide: GeminiProvider, useValue: mockGeminiProvider },
      ],
    }).compile();

    service = module.get<SupplyService>(SupplyService);
    supplyRepository = module.get(SupplyRepository);
    userService = module.get(UserService);
    promptService = module.get(PromptService);
    genAi = module.get(GeminiProvider);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createSupply', () => {
    it('should successfully create a supply', async () => {
      const dto: SupplyInfoDto = { studentId: '1', level: 'A1' } as any;
      userService.findById.mockResolvedValue({ fullName: 'John Doe', objective: 'Test', prognosis: 'Test' } as any);
      promptService.getPromptByLevel.mockResolvedValue({ prompt: 'Mock prompt' } as any);
      const validJson = JSON.stringify([{
        index: 1,
        title: 'Module 1',
        description: 'Desc',
        videoUrl: 'http://test',
        quiz: [{ question: 'Q', options: ['A', 'B'], answer: 'A' }]
      }]);
      genAi.generateContent.mockResolvedValue(validJson);
      supplyRepository.save.mockResolvedValue();

      const result = await service.createSupply(dto);

      expect(result).toEqual(dto);
      expect(supplyRepository.save).toHaveBeenCalledTimes(1);
    });

    it('should throw NotFoundException if student not found', async () => {
      userService.findById.mockResolvedValue(null);

      await expect(service.createSupply({ studentId: '1', level: 'A1' } as any)).rejects.toThrow(NotFoundException);
    });

    it('should throw InternalServerErrorException if prompt not found', async () => {
      userService.findById.mockResolvedValue({ fullName: 'John' } as any);
      promptService.getPromptByLevel.mockResolvedValue(null);

      await expect(service.createSupply({ studentId: '1', level: 'A1' } as any)).rejects.toThrow(InternalServerErrorException);
    });

    it('should throw InternalServerErrorException if AI returns invalid JSON', async () => {
      userService.findById.mockResolvedValue({ fullName: 'John' } as any);
      promptService.getPromptByLevel.mockResolvedValue({ prompt: 'prompt' } as any);
      genAi.generateContent.mockResolvedValue('invalid json');

      await expect(service.createSupply({ studentId: '1', level: 'A1' } as any)).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('findSuppliesByStudentId', () => {
    it('should return supplies', async () => {
      const supplies = [new Supply('1', 'A1' as any, [])];
      supplyRepository.findByStudentId.mockResolvedValue(supplies);

      const result = await service.findSuppliesByStudentId('1');
      expect(result).toEqual(supplies);
    });
  });

  describe('findSupplyByStudentAndLevel', () => {
    it('should return a supply', async () => {
      const supply = new Supply('1', 'A1' as any, []);
      supplyRepository.findByStudentAndLevel.mockResolvedValue(supply);

      const result = await service.findSupplyByStudentAndLevel('1', 'A1' as any);
      expect(result).toEqual(supply);
    });
  });

  describe('deleteSupply', () => {
    it('should delete a supply', async () => {
      supplyRepository.delete.mockResolvedValue();

      await service.deleteSupply('1', 'A1' as any);
      expect(supplyRepository.delete).toHaveBeenCalledWith('1', 'A1');
    });
  });
});
