import { Test, TestingModule } from '@nestjs/testing';
import { VideoService } from '../application/video.service';
import { VideoRepository } from '../domain/video.port';
import { NotFoundException } from '@nestjs/common';
import { VideoModule, VideoLevel } from '../domain/models/module.model';
import { VideoTopic } from '../domain/models/topic.model';
import { Video } from '../domain/models/video.model';
import { VideoModuleDto } from '../domain/dto/module.dto';
import { instanceToPlain } from 'class-transformer';

const mockRepository = {
  save: jest.fn(),
  getByLevel: jest.fn()
}
const video = new Video('teste', 'teste', 'teste', 1)
const topic = new VideoTopic('teste', 'teste', [video])
const videoByLevel = new VideoModule(1, 'A1', [topic])
const videoDto = instanceToPlain(videoByLevel) as VideoModuleDto;

describe('VideoService', () => {
  let service: VideoService;
  let repository: typeof mockRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VideoService,
        {
          provide: VideoRepository,
          useValue: mockRepository
        }
      ],
    }).compile();

    service = module.get<VideoService>(VideoService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  })

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // Testing function getByLevel()
  it('Should return Not Found Exception', async () => {
    mockRepository.getByLevel.mockResolvedValue(null);
    await expect(service.getVideosByLevel('A1')).rejects.toThrow(NotFoundException);
  })
  it('Should return Success', async () => {
    mockRepository.getByLevel.mockResolvedValue([videoByLevel]);
    await expect(service.getVideosByLevel('A1')).resolves.toEqual([videoByLevel]);
  })
  // Testing function save()
  it('Should return Success', async () => {
    mockRepository.save.mockResolvedValue(undefined)
    await service.saveVideoModule(videoDto);
    expect(mockRepository).toHaveBeenCalledTimes(1);
  })
});
