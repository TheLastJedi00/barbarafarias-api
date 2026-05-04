import { Test, TestingModule } from '@nestjs/testing';
import { GeminiProvider } from './gemini.service';
import { ConfigService } from '@nestjs/config';

// Mock the GoogleGenerativeAI library
jest.mock('@google/generative-ai', () => {
  return {
    GoogleGenerativeAI: jest.fn().mockImplementation(() => {
      return {
        getGenerativeModel: jest.fn().mockReturnValue({
          generateContent: jest.fn(),
        }),
      };
    }),
  };
});

import { GoogleGenerativeAI } from '@google/generative-ai';

describe('GeminiProvider', () => {
  let service: GeminiProvider;
  let configService: jest.Mocked<ConfigService>;
  let mockGenerateContent: jest.Mock;

  beforeEach(async () => {
    mockGenerateContent = jest.fn();

    // Setup the mock for getGenerativeModel to return our mockGenerateContent
    (GoogleGenerativeAI as jest.Mock).mockImplementation(() => {
      return {
        getGenerativeModel: jest.fn().mockReturnValue({
          generateContent: mockGenerateContent,
        }),
      };
    });

    const mockConfigService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'GEMINI_API_KEY') return 'test-api-key';
        if (key === 'GEMINI_MODEL') return 'test-model';
        return null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GeminiProvider,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<GeminiProvider>(GeminiProvider);
    configService = module.get(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should throw error if API key is not defined', () => {
    configService.get.mockReturnValueOnce(null); // Return null for GEMINI_API_KEY
    
    expect(() => new GeminiProvider(configService)).toThrow(
      'GEMINI_API_KEY is not defined in environment variables',
    );
  });

  describe('generateContent', () => {
    it('should generate and clean content successfully', async () => {
      const mockResponseText = '```json\n{"key": "value"}\n```';
      mockGenerateContent.mockResolvedValue({
        response: {
          text: () => mockResponseText,
        },
      });

      const result = await service.generateContent('test prompt');

      expect(result).toBe('{"key": "value"}');
      expect(mockGenerateContent).toHaveBeenCalledWith('test prompt');
    });

    it('should throw an error if generation fails', async () => {
      mockGenerateContent.mockRejectedValue(new Error('API Error'));

      await expect(service.generateContent('test prompt')).rejects.toThrow(
        'Failed to generate content with Gemini: API Error',
      );
    });
  });
});
