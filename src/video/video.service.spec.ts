import { Test, TestingModule } from '@nestjs/testing';
import { VideoService } from './video.service';
import { VideoRepository } from './video.repository';
import { NotFoundException } from '@nestjs/common';
import { VideoModuleDto } from './dtos/video.dto';
import { Video } from './video.entity';

describe('VideoService', () => {
  let service: VideoService;
  let repository: jest.Mocked<VideoRepository>;

  beforeEach(async () => {
    const mockRepository = {
      save: jest.fn(),
      getByLevel: jest.fn(),
      deleteByLevelAndIndexAndTopicAndYoutubeId: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VideoService,
        {
          provide: VideoRepository,
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<VideoService>(VideoService);
    repository = module.get(VideoRepository);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('saveVideoModule', () => {
    it('should successfully save a video module', async () => {
      const dto = { level: 'A1', index: 1, topic: [] } as any as VideoModuleDto;
      repository.save.mockResolvedValue(undefined);

      await service.saveVideoModule(dto);

      expect(repository.save).toHaveBeenCalledTimes(1);
      expect(repository.save).toHaveBeenCalledWith(expect.any(Video), 'A1_1');
    });

    it('should throw an error if repository fails', async () => {
      const dto = { level: 'A1', index: 1, topic: [] } as any as VideoModuleDto;
      repository.save.mockRejectedValue(new Error('DB Error'));

      await expect(service.saveVideoModule(dto)).rejects.toThrow('DB Error');
    });
  });

  describe('getVideosByLevel', () => {
    it('should return videos if found', async () => {
      const videos = [new Video(1, 'A1', [])];
      repository.getByLevel.mockResolvedValue(videos);

      const result = await service.getVideosByLevel('A1');

      expect(result).toEqual(videos);
      expect(repository.getByLevel).toHaveBeenCalledWith('A1');
    });

    it('should throw NotFoundException if no videos are found', async () => {
      repository.getByLevel.mockResolvedValue([]);

      await expect(service.getVideosByLevel('A1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('deleteVideo', () => {
    it('should successfully delete a video', async () => {
      repository.deleteByLevelAndIndexAndTopicAndYoutubeId.mockResolvedValue(
        undefined,
      );

      await service.deleteVideo('A1', 1, 'Topic', 'yt123');

      expect(
        repository.deleteByLevelAndIndexAndTopicAndYoutubeId,
      ).toHaveBeenCalledWith('A1', 1, 'Topic', 'yt123');
    });

    it('should throw an error if repository fails', async () => {
      repository.deleteByLevelAndIndexAndTopicAndYoutubeId.mockRejectedValue(
        new Error('DB Error'),
      );

      await expect(
        service.deleteVideo('A1', 1, 'Topic', 'yt123'),
      ).rejects.toThrow('DB Error');
    });
  });
});
