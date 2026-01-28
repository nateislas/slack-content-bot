
import { LLMFactory } from '../llm/llmFactory';
import fs from 'fs';
import path from 'path';
import { config } from '../config';
import { ConversationChunk, ContentOpportunity } from '../types';
import { feedbackManager } from '../feedback/feedbackManager';

// Remove direct model initialization - now handled by factory

// Load prompt template
const promptTemplate = fs.readFileSync(
  path.join(__dirname, '../../prompts/detect-content.txt'),
  'utf-8'
);

/**
 * Format messages for the prompt
 */
function formatMessages(chunk: ConversationChunk): string {
  return chunk.messages
    .map(msg => {
      const time = msg.timestamp.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
      });
      return `[${time}] ${msg.userName}: ${msg.text}`;
    })
    .join('\n');
}

/**
 * Parse the LLM response into a ContentOpportunity
 */
function parseResponse(response: string, chunk: ConversationChunk): ContentOpportunity | null {
  if (response.trim() === 'NONE') {
    return null;
  }

  const lines = response.split('\n');
  const result: Partial<ContentOpportunity> = {
    originalMessages: chunk.messages,
    channelId: chunk.channelId,
  };

  for (const line of lines) {
    if (line.startsWith('TOPIC:')) {
      result.topic = line.replace('TOPIC:', '').trim();
    } else if (line.startsWith('STRENGTH_REASONING:')) {
      result.strengthReasoning = line.replace('STRENGTH_REASONING:', '').trim();
    } else if (line.startsWith('STRENGTH:')) {
      const strength = line.replace('STRENGTH:', '').trim().toLowerCase();
      result.strength = strength as 'high' | 'medium' | 'low';
    } else if (line.startsWith('WHY_COMPELLING:')) {
      result.whyCompelling = line.replace('WHY_COMPELLING:', '').trim();
    } else if (line.startsWith('KEY_QUOTES:')) {
      const quotesStr = line.replace('KEY_QUOTES:', '').trim();
      // Parse quotes - they might be in array format or comma-separated
      result.keyQuotes = quotesStr
        .replace(/^\[|\]$/g, '')
        .split(/",\s*"/)
        .map(q => q.replace(/^"|"$/g, '').trim())
        .filter(q => q.length > 0);
    }
  }

  // Default reasoning if not provided
  if (!result.strengthReasoning) {
    result.strengthReasoning = 'No specific reasoning provided';
  }

  // Validate we have all required fields
  if (result.topic && result.strength && result.whyCompelling && result.keyQuotes) {
    return result as ContentOpportunity;
  }

  return null;
}

/**
 * Detect content opportunities in a conversation chunk
 */
export async function detectContentOpportunity(
  chunk: ConversationChunk
): Promise<ContentOpportunity | null> {
  const formattedMessages = formatMessages(chunk);

  // Get feedback
  const feedback = feedbackManager.getNegativeFeedbackSummary();
  const feedbackText = feedback.length > 0
    ? feedback.map(f => `- ${f}`).join('\n')
    : 'No specific negative feedback provided yet.';

  const prompt = promptTemplate
    .replace('{{MESSAGES}}', formattedMessages)
    .replace('{{USER_PREFERENCES}}', feedbackText);

  try {
    const text = await LLMFactory.getProvider().generateContent(prompt);

    if (!text) {
      return null;
    }

    return parseResponse(text, chunk);
  } catch (error) {
    console.error('Error detecting content opportunity:', error);
    return null;
  }
}
