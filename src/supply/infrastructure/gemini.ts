import { GoogleGenerativeAI } from "@google/generative-ai";
import { GenerativeAIService } from "../domain/genai.port";
import { ConfigService } from "@nestjs/config";

export class GeminiProvider implements GenerativeAIService {
    private genAI: GoogleGenerativeAI;
    private model: any;

    constructor(private readonly configService: ConfigService) {
        const apiKey = this.configService.get<string>('GEMINI_API_KEY');
        if (!apiKey) {
            throw new Error("GEMINI_API_KEY is not defined in environment variables");
        }
        this.genAI = new GoogleGenerativeAI(apiKey);
        const modelName = this.configService.get<string>('GEMINI_MODEL') || 'gemini-3-pro-preview';

        this.model = this.genAI.getGenerativeModel({
            model: modelName,
            generationConfig: {
                responseMimeType: 'application/json'
            }
        });
    }

    generateContent(prompt: string): Promise<string> {
        throw new Error("Method not implemented.");
    }
    

}