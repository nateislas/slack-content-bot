import { config } from '../config';
import { BufferedMessage } from '../types';

/**
 * Check if a message should be excluded from analysis
 */
export function shouldExcludeMessage(message: BufferedMessage): boolean {
  const text = message.text.toLowerCase();

  // Check for off-the-record emoji
  if (text.startsWith(config.privacy.offRecordEmoji)) {
    return true;
  }

  // Check for blocked keywords
  for (const keyword of config.privacy.blockedKeywords) {
    if (text.includes(keyword)) {
      return true;
    }
  }

  // Skip messages that are primarily code blocks
  const codeBlockPattern = /```[\s\S]*```/g;
  const codeBlocks = text.match(codeBlockPattern) || [];
  const codeLength = codeBlocks.reduce((sum, block) => sum + block.length, 0);
  if (codeLength > text.length * 0.5) {
    return true;
  }

  // Skip very short messages (likely not content-worthy)
  if (text.length < 10) {
    return true;
  }

  return false;
}

/**
 * Filter a list of messages, removing excluded ones
 */
export function filterMessages(messages: BufferedMessage[]): BufferedMessage[] {
  return messages.filter(msg => !shouldExcludeMessage(msg));
}
