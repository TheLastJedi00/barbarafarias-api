import { Test, TestingModule } from '@nestjs/testing';
import { TeacherService } from './teacher.service';
import { TeacherRepository } from './teacher.repository';
import { Teacher } from './teacher.entity';

describe('TeacherService', () => {
  let service: TeacherService;
  let repository: jest.Mocked<TeacherRepository>;

  beforeEach(async () => {
    const mockRepository = {
      findById: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TeacherService,
        {
          provide: TeacherRepository,
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<TeacherService>(TeacherService);
    repository = module.get(TeacherRepository);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findTeacherById', () => {
    it('should return the teacher if found', async () => {
      const teacher = new Teacher('1', 'Test Teacher', 'test@test.com', 'A1');
      repository.findById.mockResolvedValue(teacher);

      const result = await service.findTeacherById('1');

      expect(result).toEqual(teacher);
      expect(repository.findById).toHaveBeenCalledWith('1');
    });

    it('should throw an error if teacher is not found', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.findTeacherById('1')).rejects.toThrow(
        'Teacher not found',
      );
    });
  });
});
