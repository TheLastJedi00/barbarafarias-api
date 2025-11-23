import { GoogleGenerativeAI } from '@google/generative-ai';
import { GenerativeAIService } from '../domain/genai.port';
import { ConfigService } from '@nestjs/config';
import { StudentInfo } from '../domain/types/student.info';
import { Module } from '../domain/types/student.supply';
import { Injectable } from '@nestjs/common';

@Injectable()
export class GeminiProvider implements GenerativeAIService {
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
      },
    });
  }

  async generateContent(prompt: string, studentInfo: StudentInfo): Promise<Module[]> {
    let cleanText = '';
    try {
      const fullPrompt = `${prompt}\n
        Dados do aluno:\n
        Nome: ${studentInfo.firstName}\n
        Objetivos pessoais do aluno: ${studentInfo.objectives}\n
        Prognóstico da Teacher: ${studentInfo.prognosis}`;
      const result = await this.model.generateContent(fullPrompt);
      const response = await result.response;
      const text: string = response.text();
      cleanText = text
        .replace(/```json/g, '')
        .replace(/```/g, '')
        .trim();
      const modules: Module[] = JSON.parse(cleanText);
      return modules;
    } catch (error) {
      console.error('Falha ao processar resposta do Gemini.');
      console.error('Erro:', error);
      console.error('Texto recebido (Raw):', cleanText);
      throw new Error(`Failed to generate content with Gemini: ${error.message}`);
    }
  }
}
