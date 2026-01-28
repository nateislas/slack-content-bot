export interface LLMProvider {
    /**
     * meaningful name for the provider
     */
    name: string;

    /**
     * Generate text content from a prompt
     * @param prompt The prompt to send to the LLM
     */
    generateContent(prompt: string): Promise<string | null>;
}
