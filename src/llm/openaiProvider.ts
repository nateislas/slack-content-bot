import OpenAI from 'openai';
import { LLMProvider } from './types';
import { config } from '../config';

export class OpenAIProvider implements LLMProvider {
    name = 'openai';
    private client: OpenAI;

    constructor() {
        this.client = new OpenAI({
            apiKey: config.llm.keys.openai,
        });
    }

    async generateContent(prompt: string): Promise<string | null> {
        try {
            const response = await this.client.chat.completions.create({
                model: config.llm.model || 'gpt-4-turbo-preview',
                messages: [{ role: 'user', content: prompt }],
                temperature: config.llm.temperature,
            });

            return response.choices[0]?.message?.content || null;
        } catch (error) {
            console.error('OpenAI generation error:', error);
            return null;
        }
    }
}
