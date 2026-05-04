import { Test, TestingModule } from '@nestjs/testing';
import { PromptService } from './prompt.service';
import { PromptRepository } from './prompt.repository';
import { NotFoundException } from '@nestjs/common';
import { Prompt } from './prompt.model';

describe('PromptService', () => {
  let service: PromptService;
  let repository: jest.Mocked<PromptRepository>;

  beforeEach(async () => {
    const mockRepository = {
      getPromptByLevel: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PromptService,
        {
          provide: PromptRepository,
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<PromptService>(PromptService);
    repository = module.get(PromptRepository);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getPromptByLevel', () => {
    it('should return the prompt if found', async () => {
      const prompt = new Prompt('A1' as any, 'Mock Prompt Text');
      repository.getPromptByLevel.mockResolvedValue(prompt);

      const result = await service.getPromptByLevel('A1' as any);

      expect(result).toEqual(prompt);
      expect(repository.getPromptByLevel).toHaveBeenCalledWith('A1');
    });

    it('should throw NotFoundException if prompt is not found', async () => {
      repository.getPromptByLevel.mockResolvedValue(null);

      await expect(service.getPromptByLevel('A1' as any)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
