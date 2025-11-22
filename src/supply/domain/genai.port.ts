export interface GenerativeAIService {
    generateContent(prompt: string): Promise<string>;
}