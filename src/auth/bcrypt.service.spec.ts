import { Test, TestingModule } from '@nestjs/testing';
import { BcryptService } from './bcrypt.service';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

describe('BcryptService', () => {
  let service: BcryptService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BcryptService],
    }).compile();

    service = module.get<BcryptService>(BcryptService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('transform', () => {
    it('should hash the password', async () => {
      const mockHash = 'hashed_password';
      (bcrypt.hash as jest.Mock).mockResolvedValue(mockHash);

      const result = await service.transform('my_password');

      expect(result).toBe(mockHash);
      expect(bcrypt.hash).toHaveBeenCalledWith('my_password', 10);
    });
  });

  describe('compare', () => {
    it('should return true if password matches hash', async () => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.compare('my_password', 'hashed_password');

      expect(result).toBe(true);
      expect(bcrypt.compare).toHaveBeenCalledWith('my_password', 'hashed_password');
    });

    it('should return false if password does not match hash', async () => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      const result = await service.compare('wrong_password', 'hashed_password');

      expect(result).toBe(false);
      expect(bcrypt.compare).toHaveBeenCalledWith('wrong_password', 'hashed_password');
    });
  });
});
