import {
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { VideoLessonService } from './video-lesson.service';
import { VideoLesson } from './video-lesson.model';

const teacher = { sub: 'teacher-1', email: 't@x', role: 'teacher' as const };

const curriculum = {
  level: 'A1',
  prompt: '',
  modules: [
    {
      id: 'm1',
      title: 'Módulo 1',
      context: '',
      order: 0,
      topics: [
        { id: 't1', title: 'Alphabet', order: 0 },
        { id: 't2', title: 'Pronúncia', order: 1, videoOnly: true },
      ],
    },
  ],
};

function lesson(overrides: Partial<VideoLesson> = {}): VideoLesson {
  return {
    id: 'v1',
    level: 'A1',
    topicId: 't1',
    title: 'Aula',
    description: '',
    order: 0,
    status: 'uploading',
    source: {
      storagePath: 'video-lessons/v1/source.mp4',
      fileName: 'aula.mp4',
      mimeType: 'video/mp4',
      size: 1000,
    },
    materials: [],
    createdBy: 'teacher-1',
    createdAt: '2026-10-24T00:00:00.000Z',
    updatedAt: '2026-10-24T00:00:00.000Z',
    ...overrides,
  };
}

function setup() {
  const repository = {
    newId: jest.fn().mockReturnValue('v1'),
    findById: jest.fn(),
    findByLevel: jest.fn().mockResolvedValue([]),
    findByTopic: jest.fn().mockResolvedValue([]),
    findByAssetId: jest.fn().mockResolvedValue(null),
    save: jest.fn().mockResolvedValue(undefined),
    saveOrders: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
  };
  const curriculumService = {
    getLevel: jest.fn().mockResolvedValue(curriculum),
  };
  const storage = {
    createUploadSession: jest.fn().mockResolvedValue('https://upload'),
    getObjectInfo: jest.fn().mockResolvedValue({ size: 1234 }),
    signedReadUrl: jest.fn().mockResolvedValue('https://signed-read'),
    remove: jest.fn().mockResolvedValue(undefined),
    removePrefix: jest.fn().mockResolvedValue(undefined),
  };
  const mux = {
    isAvailable: jest.fn().mockReturnValue(true),
    createAsset: jest.fn().mockResolvedValue('asset-1'),
    getAsset: jest.fn(),
    deleteAsset: jest.fn().mockResolvedValue(undefined),
    signPlayback: jest.fn(),
  };
  const users = { findById: jest.fn() };
  const service = new VideoLessonService(
    repository as any,
    curriculumService as any,
    storage as any,
    mux as any,
    users as any,
  );
  return { service, repository, curriculumService, storage, mux, users };
}

const createDto = {
  level: 'A1' as const,
  topicId: 't1',
  title: '  Letras  ',
  fileName: 'aula.mp4',
  mimeType: 'video/mp4',
  size: 1000,
};

describe('VideoLessonService — escrita (spec 027)', () => {
  describe('create', () => {
    it('grava em uploading no fim do tópico e devolve a URL de upload', async () => {
      const { service, repository, storage } = setup();
      repository.findByTopic.mockResolvedValue([lesson({ order: 4 })]);

      const result = await service.create(
        createDto,
        teacher,
        'http://localhost:4200',
      );

      expect(result.uploadUrl).toBe('https://upload');
      expect(storage.createUploadSession).toHaveBeenCalledWith(
        'video-lessons/v1/source.mp4',
        'video/mp4',
        'http://localhost:4200',
      );
      const saved = repository.save.mock.calls[0][0];
      expect(saved).toMatchObject({
        title: 'Letras',
        status: 'uploading',
        order: 5,
        createdBy: 'teacher-1',
      });
    });

    it('aceita tópico só de vídeo', async () => {
      const { service } = setup();
      await expect(
        service.create({ ...createDto, topicId: 't2' }, teacher),
      ).resolves.toBeDefined();
    });

    it('503 antes de gravar quando o Mux não está configurado', async () => {
      const { service, mux, repository, storage } = setup();
      mux.isAvailable.mockReturnValue(false);

      await expect(service.create(createDto, teacher)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(storage.createUploadSession).not.toHaveBeenCalled();
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('recusa formato que não é vídeo', async () => {
      const { service } = setup();
      await expect(
        service.create({ ...createDto, mimeType: 'application/pdf' }, teacher),
      ).rejects.toThrow('Formato de vídeo não aceito');
    });

    it('recusa vídeo acima de 5 GB', async () => {
      const { service } = setup();
      await expect(
        service.create({ ...createDto, size: 6 * 1024 ** 3 }, teacher),
      ).rejects.toThrow('5 GB');
    });

    it('recusa tópico que não é do nível', async () => {
      const { service } = setup();
      await expect(
        service.create({ ...createDto, topicId: 'outro' }, teacher),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('completeUpload', () => {
    it('confere o objeto e manda o Mux ingerir pela URL assinada', async () => {
      const { service, repository, storage, mux } = setup();
      repository.findById.mockResolvedValue(lesson());

      const view = await service.completeUpload('v1');

      expect(storage.signedReadUrl).toHaveBeenCalledWith(
        'video-lessons/v1/source.mp4',
        24 * 60 * 60 * 1000,
      );
      expect(mux.createAsset).toHaveBeenCalledWith('https://signed-read', 'v1');
      expect(view.status).toBe('processing');
      expect(repository.save.mock.calls[0][0]).toMatchObject({
        mux: { assetId: 'asset-1' },
        source: { size: 1234 },
      });
    });

    it('409 quando o arquivo não chegou', async () => {
      const { service, repository, storage } = setup();
      repository.findById.mockResolvedValue(lesson());
      storage.getObjectInfo.mockResolvedValue(null);

      await expect(service.completeUpload('v1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('apaga e recusa o que chegou acima do teto', async () => {
      const { service, repository, storage, mux } = setup();
      repository.findById.mockResolvedValue(lesson());
      storage.getObjectInfo.mockResolvedValue({ size: 6 * 1024 ** 3 });

      await expect(service.completeUpload('v1')).rejects.toThrow('5 GB');
      expect(storage.remove).toHaveBeenCalledWith(
        'video-lessons/v1/source.mp4',
      );
      expect(mux.createAsset).not.toHaveBeenCalled();
    });

    it('repetir depois de processing não cria segundo asset', async () => {
      const { service, repository, mux } = setup();
      repository.findById.mockResolvedValue(
        lesson({ status: 'processing', mux: { assetId: 'asset-1' } }),
      );

      await service.completeUpload('v1');
      expect(mux.createAsset).not.toHaveBeenCalled();
    });
  });

  describe('sync e webhook', () => {
    const processing = () =>
      lesson({ status: 'processing', mux: { assetId: 'asset-1' } });

    it('sync leva o asset pronto para a aula', async () => {
      const { service, repository, mux } = setup();
      repository.findById.mockResolvedValue(processing());
      mux.getAsset.mockResolvedValue({
        assetId: 'asset-1',
        status: 'ready',
        playbackId: 'pb',
        durationSec: 300,
      });

      const view = await service.sync('v1');
      expect(view).toMatchObject({ status: 'ready', durationSec: 300 });
      expect(repository.save.mock.calls[0][0].mux).toEqual({
        assetId: 'asset-1',
        playbackId: 'pb',
        durationSec: 300,
      });
    });

    it('sync com asset ainda preparando não grava', async () => {
      const { service, repository, mux } = setup();
      repository.findById.mockResolvedValue(processing());
      mux.getAsset.mockResolvedValue({
        assetId: 'asset-1',
        status: 'preparing',
      });

      await service.sync('v1');
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('webhook de erro marca errored com o motivo', async () => {
      const { service, repository } = setup();
      repository.findById.mockResolvedValue(processing());

      await service.handleMuxEvent({
        assetId: 'asset-1',
        status: 'errored',
        passthrough: 'v1',
        error: 'Invalid input',
      });
      expect(repository.save.mock.calls[0][0]).toMatchObject({
        status: 'errored',
        errorMessage: 'Invalid input',
      });
    });

    it('webhook repetido depois de ready é ignorado', async () => {
      const { service, repository } = setup();
      repository.findById.mockResolvedValue(
        lesson({
          status: 'ready',
          mux: { assetId: 'asset-1', playbackId: 'pb' },
        }),
      );

      await service.handleMuxEvent({
        assetId: 'asset-1',
        status: 'ready',
        passthrough: 'v1',
        playbackId: 'pb',
      });
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('webhook de asset desconhecido não falha', async () => {
      const { service, repository } = setup();
      repository.findById.mockResolvedValue(null);

      await expect(
        service.handleMuxEvent({ assetId: 'x', status: 'ready' }),
      ).resolves.toBeUndefined();
      expect(repository.save).not.toHaveBeenCalled();
    });
  });

  describe('materiais', () => {
    const pdf = {
      fileName: 'Lição 1.pdf',
      mimeType: 'application/pdf',
      size: 2048,
    };
    const material = (overrides = {}) => ({
      id: 'mat-1',
      fileName: 'Lição 1.pdf',
      storagePath: 'video-lessons/v1/materials/mat-1.pdf',
      mimeType: 'application/pdf',
      size: 2048,
      status: 'uploading' as const,
      uploadedAt: '2026-10-24T00:00:00.000Z',
      ...overrides,
    });

    it('reserva o material em uploading e devolve a URL', async () => {
      const { service, repository, storage } = setup();
      repository.findById.mockResolvedValue(lesson({ status: 'ready' }));

      const result = await service.addMaterial('v1', pdf);

      expect(result.uploadUrl).toBe('https://upload');
      expect(result.material).not.toHaveProperty('storagePath');
      const path = storage.createUploadSession.mock.calls[0][0];
      expect(path).toMatch(/^video-lessons\/v1\/materials\/.+\.pdf$/);
      expect(repository.save.mock.calls[0][0].materials[0]).toMatchObject({
        status: 'uploading',
        storagePath: path,
      });
    });

    it('recusa tipo, tamanho e quantidade fora do limite', async () => {
      const { service, repository } = setup();
      repository.findById.mockResolvedValue(lesson());

      await expect(
        service.addMaterial('v1', {
          ...pdf,
          mimeType: 'application/x-msdownload',
        }),
      ).rejects.toThrow('Tipo de arquivo não aceito');
      await expect(
        service.addMaterial('v1', { ...pdf, size: 51 * 1024 * 1024 }),
      ).rejects.toThrow('50 MB');

      repository.findById.mockResolvedValue(
        lesson({
          materials: Array.from({ length: 10 }, (_, i) =>
            material({ id: `m${i}` }),
          ),
        }),
      );
      await expect(service.addMaterial('v1', pdf)).rejects.toThrow('até 10');
    });

    it('confirma com o tamanho real e libera', async () => {
      const { service, repository, storage } = setup();
      repository.findById.mockResolvedValue(
        lesson({ materials: [material()] }),
      );
      storage.getObjectInfo.mockResolvedValue({ size: 3000 });

      const view = await service.completeMaterial('v1', 'mat-1');
      expect(view).toMatchObject({ status: 'ready', size: 3000 });
    });

    it('confirmação de arquivo grande demais apaga e descarta', async () => {
      const { service, repository, storage } = setup();
      repository.findById.mockResolvedValue(
        lesson({ materials: [material()] }),
      );
      storage.getObjectInfo.mockResolvedValue({ size: 60 * 1024 * 1024 });

      await expect(service.completeMaterial('v1', 'mat-1')).rejects.toThrow(
        '50 MB',
      );
      expect(storage.remove).toHaveBeenCalled();
      expect(repository.save.mock.calls[0][0].materials).toEqual([]);
    });

    it('remove o arquivo e o registro', async () => {
      const { service, repository, storage } = setup();
      repository.findById.mockResolvedValue(
        lesson({ materials: [material({ status: 'ready' })] }),
      );

      await service.removeMaterial('v1', 'mat-1');
      expect(storage.remove).toHaveBeenCalledWith(
        'video-lessons/v1/materials/mat-1.pdf',
      );
      expect(repository.save.mock.calls[0][0].materials).toEqual([]);
    });

    it('404 para material inexistente', async () => {
      const { service, repository } = setup();
      repository.findById.mockResolvedValue(lesson());
      await expect(service.removeMaterial('v1', 'nope')).rejects.toThrow(
        'Material não encontrado',
      );
    });
  });

  describe('edição, ordem e remoção', () => {
    it('mover de tópico vai para o fim do novo tópico', async () => {
      const { service, repository } = setup();
      repository.findById.mockResolvedValue(lesson({ status: 'ready' }));
      repository.findByTopic.mockResolvedValue([
        lesson({ id: 'v9', order: 2 }),
      ]);

      const view = await service.update('v1', { topicId: 't2' });
      expect(view).toMatchObject({ topicId: 't2', order: 3 });
    });

    it('reordena só com exatamente os vídeos do tópico', async () => {
      const { service, repository } = setup();
      repository.findByTopic.mockResolvedValue([
        lesson({ id: 'a' }),
        lesson({ id: 'b' }),
      ]);

      await expect(
        service.reorder('t1', { ids: ['a'] }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await service.reorder('t1', { ids: ['b', 'a'] });
      expect(repository.saveOrders.mock.calls[0][0]).toEqual([
        { id: 'b', order: 0 },
        { id: 'a', order: 1 },
      ]);
    });

    it('remover apaga asset, Storage e doc', async () => {
      const { service, repository, storage, mux } = setup();
      repository.findById.mockResolvedValue(
        lesson({ status: 'ready', mux: { assetId: 'asset-1' } }),
      );

      await service.remove('v1');
      expect(mux.deleteAsset).toHaveBeenCalledWith('asset-1');
      expect(storage.removePrefix).toHaveBeenCalledWith('video-lessons/v1/');
      expect(repository.delete).toHaveBeenCalledWith('v1');
    });
  });
});
