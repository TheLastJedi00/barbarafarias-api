import { GoogleGenerativeAI } from '@google/generative-ai';
import { ConfigService } from '@nestjs/config';
import { Injectable } from '@nestjs/common';

@Injectable()
export class GeminiProvider {
  private genAI: GoogleGenerativeAI;
  private model: any;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not defined in environment variables');
    }
    this.genAI = new GoogleGenerativeAI(apiKey);
    const modelName =
      this.configService.get<string>('GEMINI_MODEL') || 'gemini-2.5-pro';

    this.model = this.genAI.getGenerativeModel({
      model: modelName,
      generationConfig: {
        responseMimeType: 'application/json',
        maxOutputTokens: 50000,
        temperature: 0.3,
      },
    });
  }

  async generateContent(prompt: string): Promise<string> {
    let cleanText = '';
    try {
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const text: string = response.text();
      console.log(text);
      cleanText = text
        .replace(/```json/g, '')
        .replace(/```/g, '')
        .trim();
      return cleanText;
    } catch (error) {
      console.error('Falha ao processar resposta do Gemini.');
      console.error('Erro:', error);
      console.error('Texto recebido (Raw):', cleanText);
      throw new Error(
        `Failed to generate content with Gemini: ${error.message}`,
      );
    }
  }
}
