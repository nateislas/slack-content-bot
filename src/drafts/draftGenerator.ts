import { LLMFactory } from '../llm/llmFactory';
import fs from 'fs';
import path from 'path';
import { config } from '../config';
import { ContentOpportunity, DraftSuggestion } from '../types';

// Remove direct model initialization - now handled by factory

// Load prompt templates
const promptTemplate = fs.readFileSync(
  path.join(__dirname, '../../prompts/generate-drafts.txt'),
  'utf-8'
);

const writingRules = fs.readFileSync(
  path.join(__dirname, '../../prompts/writing-rules.txt'),
  'utf-8'
);

/**
 * Parse the draft response
 */
function parseDrafts(response: string): { linkedin: string; x: string } | null {
  const linkedinMatch = response.match(/LINKEDIN:\s*([\s\S]*?)(?=X:|$)/i);
  const xMatch = response.match(/X:\s*([\s\S]*?)$/i);

  if (!linkedinMatch || !xMatch) {
    return null;
  }

  return {
    linkedin: linkedinMatch[1].trim(),
    x: xMatch[1].trim(),
  };
}

/**
 * Generate draft posts from a content opportunity
 */
export async function generateDrafts(
  opportunity: ContentOpportunity
): Promise<DraftSuggestion | null> {
  const prompt = promptTemplate
    .replace('{{TOPIC}}', opportunity.topic)
    .replace('{{WHY_COMPELLING}}', opportunity.whyCompelling)
    .replace('{{KEY_QUOTES}}', opportunity.keyQuotes.map(q => `"${q}"`).join('\n'))
    .replace('{{WRITING_RULES}}', writingRules);

  try {
    const text = await LLMFactory.getProvider().generateContent(prompt);

    if (!text) {
      return null;
    }

    const drafts = parseDrafts(text);
    if (!drafts) {
      return null;
    }

    return {
      opportunity,
      linkedInDraft: drafts.linkedin,
      xDraft: drafts.x,
      generatedAt: new Date(),
      channelName: '', // Will be filled by index.ts
      sourceLink: '', // Will be filled by index.ts
    };
  } catch (error) {
    console.error('Error generating drafts:', error);
    return null;
  }
}
