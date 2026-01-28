import { GoogleGenerativeAI } from '@google/generative-ai';
import { LLMProvider } from './types';
import { config } from '../config';

export class GoogleProvider implements LLMProvider {
    name = 'google';
    private model: any;

    constructor() {
        const genAI = new GoogleGenerativeAI(config.llm.keys.google);
        this.model = genAI.getGenerativeModel({
            model: config.llm.model || 'gemini-2.5-flash-lite',
            generationConfig: {
                temperature: config.llm.temperature,
            },
        });
    }

    async generateContent(prompt: string): Promise<string | null> {
        try {
            const result = await this.model.generateContent(prompt);
            const response = result.response;
            return response.text();
        } catch (error) {
            console.error('Gemini generation error:', error);
            return null;
        }
    }
}
