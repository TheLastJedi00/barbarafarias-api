import { InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { SupplyService } from './supply.service';

const VALID_TOPIC = {
  topic: 'Greetings',
  description: 'Como cumprimentar',
  examples: ['Hello'],
  curiosity: 'Curiosidade',
  roleplayInstruction: 'Faça um diálogo',
  roleplayDialog: ['A: Hi'],
  words: [{ english: 'hello', portuguese: 'olá', pronounce: 'rêlou' }],
  music: { title: 'Hello', artist: 'Adele', youtube: 'https://y.tube/x' },
};

const VALID_SKELETON = [
  { title: 'Módulo 1', text: 'Intro', topics: [{ topic: 'Greetings' }] },
];

const VALID_MODULES = [
  { title: 'Módulo 1', text: 'Intro', topics: [VALID_TOPIC] },
];

function makeStudent() {
  return {
    fullName: 'Ana Maria',
    objective: 'Viajar',
    prognosis: 'Bom',
  };
}

describe('SupplyService (fluxo granular)', () => {
  let service: SupplyService;
  let supplyRepository: { save: jest.Mock };
  let userService: { findById: jest.Mock };
  let promptService: { getPromptByLevel: jest.Mock };
  let genAi: { generateJson: jest.Mock };

  const dto = { studentId: 's1', level: 'A1' } as any;
  const topicDto = {
    studentId: 's1',
    level: 'A1',
    moduleTitle: 'Módulo 1',
    topicTitle: 'Greetings',
  } as any;

  beforeEach(() => {
    supplyRepository = { save: jest.fn().mockResolvedValue('s1_A1') };
    userService = { findById: jest.fn().mockResolvedValue(makeStudent()) };
    promptService = {
      getPromptByLevel: jest.fn().mockResolvedValue({ prompt: 'Gere módulos' }),
    };
    genAi = { generateJson: jest.fn() };
    service = new SupplyService(
      supplyRepository as any,
      userService as any,
      promptService as any,
      genAi as any,
    );
  });

  describe('generateSkeleton', () => {
    it('devolve os módulos com ids estáveis de tópico', async () => {
      genAi.generateJson.mockResolvedValue(VALID_SKELETON);
      const result = await service.generateSkeleton(dto);
      expect(result.modules[0].topics[0].id).toBe('m0_t0');
      expect(result.modules[0].topics[0].topic).toBe('Greetings');
    });

    it('propaga NotFound quando o aluno não existe', async () => {
      userService.findById.mockResolvedValue(null);
      await expect(service.generateSkeleton(dto)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('generateTopic', () => {
    it('devolve o tópico gerado no caminho feliz', async () => {
      genAi.generateJson.mockResolvedValue(VALID_TOPIC);
      const result = await service.generateTopic(topicDto);
      expect(result.topic).toBe('Greetings');
      expect(result.words[0].english).toBe('hello');
    });

    it('propaga 500 quando a IA retorna formato inválido', async () => {
      genAi.generateJson.mockRejectedValue(
        new InternalServerErrorException('A IA retornou um formato inválido.'),
      );
      await expect(service.generateTopic(topicDto)).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
    });
  });

  describe('consolidate', () => {
    it('persiste o material válido no caminho feliz', async () => {
      const result = await service.consolidate({
        ...dto,
        modules: VALID_MODULES,
      });
      expect(supplyRepository.save).toHaveBeenCalledTimes(1);
      expect(result).toBeDefined();
    });

    it('rejeita material malformado sem persistir', async () => {
      await expect(
        service.consolidate({ ...dto, modules: [{ title: 123 }] as any }),
      ).rejects.toBeInstanceOf(InternalServerErrorException);
      expect(supplyRepository.save).not.toHaveBeenCalled();
    });

    it('propaga erro quando a gravação falha', async () => {
      supplyRepository.save.mockRejectedValue(new Error('firestore down'));
      await expect(
        service.consolidate({ ...dto, modules: VALID_MODULES }),
      ).rejects.toBeInstanceOf(InternalServerErrorException);
    });
  });
});
