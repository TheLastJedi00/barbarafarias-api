import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
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

const VALID_MODULE = {
  title: 'Módulo 1',
  text: 'Intro',
  topics: [VALID_TOPIC],
};
const VALID_MODULES = [VALID_MODULE];

function makeStudent() {
  return {
    fullName: 'Ana Maria',
    objective: 'Viajar',
    prognosis: 'Bom',
  };
}

describe('SupplyService (fluxo granular)', () => {
  let service: SupplyService;
  let supplyRepository: {
    saveAll: jest.Mock;
    saveModule: jest.Mock;
    markComplete: jest.Mock;
    findHeader: jest.Mock;
    findModuleIndices: jest.Mock;
    findByStudentAndLevel: jest.Mock;
    findHeadersByStudentId: jest.Mock;
  };
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
    supplyRepository = {
      saveAll: jest.fn().mockResolvedValue('s1_A1'),
      saveModule: jest.fn().mockResolvedValue(undefined),
      markComplete: jest.fn().mockResolvedValue(undefined),
      findHeader: jest.fn(),
      findModuleIndices: jest.fn().mockResolvedValue([]),
      findByStudentAndLevel: jest.fn(),
      findHeadersByStudentId: jest.fn().mockResolvedValue([]),
    };
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

  describe('consolidate (atômico)', () => {
    it('persiste o material válido no caminho feliz', async () => {
      const result = await service.consolidate({
        ...dto,
        modules: VALID_MODULES,
      });
      expect(supplyRepository.saveAll).toHaveBeenCalledTimes(1);
      expect(result).toBeDefined();
    });

    /**
     * Antes do B1.3 isto virava 500 e se confundia com falha de gravação. É
     * culpa do cliente: 400, e com os caminhos que falharam no corpo.
     */
    it('rejeita material malformado com 400 e sem persistir', async () => {
      await expect(
        service.consolidate({ ...dto, modules: [{ title: 123 }] as any }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(supplyRepository.saveAll).not.toHaveBeenCalled();
    });

    it('aponta o caminho exato do campo inválido', async () => {
      const failure = await service
        .consolidate({ ...dto, modules: [{ title: 123 }] as any })
        .catch((error: BadRequestException) => error.getResponse() as any);
      expect(failure.issues[0].path).toContain('0.title');
    });

    /**
     * Falha de gravação sobe crua: o filtro global a converte em 500 e loga o
     * stack real. Embrulhar aqui só apagaria a causa.
     */
    it('propaga a falha de gravação sem mascarar de erro de validação', async () => {
      supplyRepository.saveAll.mockRejectedValue(new Error('firestore down'));
      await expect(
        service.consolidate({ ...dto, modules: VALID_MODULES }),
      ).rejects.toThrow('firestore down');
    });
  });

  describe('consolidateModule (granular)', () => {
    const moduleDto = {
      ...dto,
      index: 0,
      moduleCount: 2,
      module: VALID_MODULE,
    };

    it('grava o módulo e deixa o material em rascunho', async () => {
      const header = await service.consolidateModule(moduleDto);
      expect(supplyRepository.saveModule).toHaveBeenCalledWith(
        's1',
        'A1',
        0,
        2,
        expect.objectContaining({ title: 'Módulo 1' }),
      );
      expect(header.status).toBe('draft');
    });

    /** Retry granular: reenviar o mesmo módulo não pode duplicar nada. */
    it('é idempotente — o reenvio grava no mesmo endereço', async () => {
      await service.consolidateModule(moduleDto);
      await service.consolidateModule(moduleDto);
      const [first, second] = supplyRepository.saveModule.mock.calls;
      expect(first.slice(0, 4)).toEqual(second.slice(0, 4));
    });

    it('recusa índice fora do material anunciado', async () => {
      await expect(
        service.consolidateModule({ ...moduleDto, index: 2, moduleCount: 2 }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(supplyRepository.saveModule).not.toHaveBeenCalled();
    });

    it('rejeita módulo malformado sem persistir', async () => {
      await expect(
        service.consolidateModule({ ...moduleDto, module: { title: 123 } }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(supplyRepository.saveModule).not.toHaveBeenCalled();
    });
  });

  describe('finishConsolidation', () => {
    it('recusa fechar o que nunca começou', async () => {
      supplyRepository.findHeader.mockResolvedValue(null);
      await expect(service.finishConsolidation(dto)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    /**
     * O 409 carrega os índices em falta para o cliente reenviar só o que
     * falhou, em vez de refazer o material inteiro.
     */
    it('devolve 409 com os índices faltantes', async () => {
      supplyRepository.findHeader.mockResolvedValue({
        studentId: 's1',
        level: 'A1',
        moduleCount: 4,
        status: 'draft',
      });
      supplyRepository.findModuleIndices.mockResolvedValue([0, 2]);

      const failure: ConflictException = await service
        .finishConsolidation(dto)
        .then(
          () => {
            throw new Error('deveria ter recusado o fechamento');
          },
          (error: ConflictException) => error,
        );

      expect(failure).toBeInstanceOf(ConflictException);
      expect((failure.getResponse() as any).missing).toEqual([1, 3]);
      expect(supplyRepository.markComplete).not.toHaveBeenCalled();
    });

    it('marca completo e devolve o material quando tudo chegou', async () => {
      supplyRepository.findHeader.mockResolvedValue({
        studentId: 's1',
        level: 'A1',
        moduleCount: 2,
        status: 'draft',
      });
      supplyRepository.findModuleIndices.mockResolvedValue([0, 1]);
      supplyRepository.findByStudentAndLevel.mockResolvedValue({
        toPlainObject: () => ({
          studentId: 's1',
          level: 'A1',
          modules: VALID_MODULES,
        }),
      });

      const result = await service.finishConsolidation(dto);

      expect(supplyRepository.markComplete).toHaveBeenCalledWith('s1', 'A1', 2);
      expect(result).toBeDefined();
    });
  });
});
