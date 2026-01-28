import { config } from '../config';
import { LLMProvider } from './types';
import { GoogleProvider } from './googleProvider';
import { OpenAIProvider } from './openaiProvider';
import { AnthropicProvider } from './anthropicProvider';

export class LLMFactory {
    private static instance: LLMProvider;

    static getProvider(): LLMProvider {
        if (!this.instance) {
            const provider = config.llm.provider;
            console.log(`🧠 Initializing LLM Provider: ${provider}`);

            switch (provider) {
                case 'google':
                    this.instance = new GoogleProvider();
                    break;
                case 'openai':
                    this.instance = new OpenAIProvider();
                    break;
                case 'anthropic':
                    this.instance = new AnthropicProvider();
                    break;
                default:
                    throw new Error(`Unknown LLM provider: ${provider}`);
            }
        }
        return this.instance;
    }
}
