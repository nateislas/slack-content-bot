import Anthropic from '@anthropic-ai/sdk';
import { LLMProvider } from './types';
import { config } from '../config';

export class AnthropicProvider implements LLMProvider {
    name = 'anthropic';
    private client: Anthropic;

    constructor() {
        this.client = new Anthropic({
            apiKey: config.llm.keys.anthropic,
        });
    }

    async generateContent(prompt: string): Promise<string | null> {
        try {
            const msg = await this.client.messages.create({
                model: config.llm.model || 'claude-3-5-sonnet-20241022',
                max_tokens: 4096,
                temperature: config.llm.temperature,
                messages: [{ role: 'user', content: prompt }],
            });

            // Anthropic returns an array of content blocks
            const textBlock = msg.content.find(c => c.type === 'text');
            return textBlock ? (textBlock as any).text : null;
        } catch (error) {
            console.error('Anthropic generation error:', error);
            return null;
        }
    }
}
