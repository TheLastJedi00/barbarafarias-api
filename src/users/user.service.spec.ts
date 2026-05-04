import { Test, TestingModule } from '@nestjs/testing';
import { UserService } from './user.service';
import { UserRepository } from './user.repository';
import { AuthService } from '../auth/auth.service';
import { CreateUserDto } from './dto/CreateUser.dto';
import { UpdateUserDto } from './dto/UpdateUser.dto';
import { User } from './user.entity';
import { NotFoundException } from '@nestjs/common';
import * as uuid from 'uuid';

jest.mock('uuid', () => ({
  v4: jest.fn(),
}));

describe('UserService', () => {
  let service: UserService;
  let userRepository: jest.Mocked<UserRepository>;
  let authService: jest.Mocked<AuthService>;

  beforeEach(async () => {
    const mockUserRepository = {
      save: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };

    const mockAuthService = {
      registerCredentials: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        {
          provide: UserRepository,
          useValue: mockUserRepository,
        },
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
    userRepository = module.get(UserRepository);
    authService = module.get(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createUser', () => {
    it('should successfully create a user', async () => {
      const dto: CreateUserDto = {
        fullName: 'John Doe',
        email: 'john@example.com',
        password: 'password123',
        isTeacher: false,
        birthDate: '2000-01-01',
        gender: 'Male',
        country: 'Brazil',
        city: 'SP',
        level: 'A1',
      };
      const mockUuid = 'mock-uuid-123';
      (uuid.v4 as jest.Mock).mockReturnValue(mockUuid);

      authService.registerCredentials.mockResolvedValue(undefined);
      userRepository.save.mockResolvedValue(mockUuid);

      const result = await service.createUser(dto);

      expect(authService.registerCredentials).toHaveBeenCalledWith({
        id: mockUuid,
        email: dto.email,
        password: dto.password,
        role: 'student',
      });
      expect(userRepository.save).toHaveBeenCalledTimes(1);
      expect(result.id).toBe(mockUuid);
      expect(result.fullName).toBe(dto.fullName);
    });

    it('should assign teacher role if isTeacher is true', async () => {
      const dto: CreateUserDto = {
        fullName: 'Jane Doe',
        email: 'jane@example.com',
        password: 'password123',
        isTeacher: true,
        birthDate: '1990-01-01',
        gender: 'Female',
        country: 'Brazil',
        city: 'SP',
        level: 'Native',
      } as unknown as CreateUserDto;
      const mockUuid = 'mock-uuid-456';
      (uuid.v4 as jest.Mock).mockReturnValue(mockUuid);

      authService.registerCredentials.mockResolvedValue(undefined);
      userRepository.save.mockResolvedValue(mockUuid);

      await service.createUser(dto);

      expect(authService.registerCredentials).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'teacher' }),
      );
    });

    it('should throw an error if something fails', async () => {
      const dto = { email: 'fail@example.com', isTeacher: false } as any;
      authService.registerCredentials.mockRejectedValue(new Error('Auth failed'));

      await expect(service.createUser(dto)).rejects.toThrow(
        'Error creating User:Error: Auth failed',
      );
    });
  });

  describe('getAllUsers', () => {
    it('should return all users', async () => {
      const users = [new User({} as any)];
      userRepository.findAll.mockResolvedValue(users);

      const result = await service.getAllUsers();
      expect(result).toEqual(users);
      expect(userRepository.findAll).toHaveBeenCalledTimes(1);
    });
  });

  describe('updateUser', () => {
    it('should update and return the user', async () => {
      const dto = { fullName: 'Updated Name' } as UpdateUserDto;
      userRepository.findById.mockResolvedValue({ id: '1' } as User);
      userRepository.update.mockResolvedValue(undefined);

      const result = await service.updateUser('1', dto);

      expect(result.fullName).toBe('Updated Name');
      expect(userRepository.update).toHaveBeenCalledTimes(1);
    });

    it('should throw an error if user not found', async () => {
      userRepository.findById.mockResolvedValue(null);

      await expect(service.updateUser('1', {} as UpdateUserDto)).rejects.toThrow(
        'User not found',
      );
    });
  });

  describe('findById', () => {
    it('should return the user if found', async () => {
      const user = { id: '1', fullName: 'Test' } as User;
      userRepository.findById.mockResolvedValue(user);

      const result = await service.findById('1');
      expect(result).toEqual(user);
    });

    it('should throw NotFoundException if not found', async () => {
      userRepository.findById.mockResolvedValue(null);

      await expect(service.findById('1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('delete', () => {
    it('should call delete on repository', async () => {
      userRepository.delete.mockResolvedValue(undefined);

      await service.delete('1');
      expect(userRepository.delete).toHaveBeenCalledWith('1');
    });
  });
});
