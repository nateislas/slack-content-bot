import { config } from '../config';
import { BufferedMessage, ConversationChunk } from '../types';
import { filterMessages } from '../privacy/filter';

interface ChannelBuffer {
  messages: BufferedMessage[];
  threads: Map<string, {
    messages: BufferedMessage[];
    lastActivity: Date;
  }>;
  lastEvaluationTime: Date;
  messagesSinceLastEvaluation: number;
}

class MessageBufferManager {
  private buffers: Map<string, ChannelBuffer> = new Map();

  /**
   * Get or create a buffer for a channel
   */
  private getBuffer(channelId: string): ChannelBuffer {
    if (!this.buffers.has(channelId)) {
      this.buffers.set(channelId, {
        messages: [],
        threads: new Map(),
        lastEvaluationTime: new Date(),
        messagesSinceLastEvaluation: 0,
      });
    }
    return this.buffers.get(channelId)!;
  }

  /**
   * Add a message to the appropriate channel buffer or thread
   */
  addMessage(message: BufferedMessage): void {
    const buffer = this.getBuffer(message.channelId);
    buffer.messagesSinceLastEvaluation++;

    if (message.threadTs) {
      // Handle thread message
      if (!buffer.threads.has(message.threadTs)) {
        buffer.threads.set(message.threadTs, {
          messages: [],
          lastActivity: new Date(),
        });
      }
      const threadBuffer = buffer.threads.get(message.threadTs)!;
      threadBuffer.messages.push(message);
      threadBuffer.lastActivity = message.timestamp;

      // Limit thread size
      if (threadBuffer.messages.length > config.buffer.maxMessages) {
        threadBuffer.messages.shift();
      }
    } else {
      // Handle main channel message
      buffer.messages.push(message);

      // Limit main channel buffer size
      if (buffer.messages.length > config.buffer.maxMessages) {
        buffer.messages.shift();
      }
    }
  }

  /**
   * Check if any channel should trigger an evaluation
   */
  getChannelsToEvaluate(): string[] {
    const channelsToEvaluate: string[] = [];

    for (const [channelId, buffer] of this.buffers) {
      // 1. Check message count threshold (global for channel)
      if (buffer.messagesSinceLastEvaluation >= config.buffer.evaluationThreshold) {
        channelsToEvaluate.push(channelId);
        continue;
      }

      // 2. Check main channel gap
      if (buffer.messages.length > 0) {
        const lastMessage = buffer.messages[buffer.messages.length - 1];
        const gapMinutes = (Date.now() - lastMessage.timestamp.getTime()) / (1000 * 60);
        if (gapMinutes >= config.buffer.conversationGapMinutes) {
          channelsToEvaluate.push(channelId);
          continue;
        }
      }

      // 3. Check thread gaps (if any thread is "done")
      for (const [threadTs, threadData] of buffer.threads) {
        if (threadData.messages.length === 0) continue;
        const gapMinutes = (Date.now() - threadData.lastActivity.getTime()) / (1000 * 60);
        if (gapMinutes >= config.buffer.conversationGapMinutes) {
          channelsToEvaluate.push(channelId);
          break; // Found one reason to evaluate channel
        }
      }
    }

    return channelsToEvaluate;
  }

  shouldEvaluate(): boolean {
    return this.getChannelsToEvaluate().length > 0;
  }

  /**
   * Get chunks from main channel and threads
   */
  getConversationChunks(channelId: string): ConversationChunk[] {
    const buffer = this.getBuffer(channelId);
    const chunks: ConversationChunk[] = [];

    // --- 1. Process Main Channel Messages ---
    const mainMessages = filterMessages(buffer.messages);
    if (mainMessages.length >= 2) {
      let currentChunk: BufferedMessage[] = [mainMessages[0]];

      for (let i = 1; i < mainMessages.length; i++) {
        const prev = mainMessages[i - 1];
        const curr = mainMessages[i];
        const gapMinutes = (curr.timestamp.getTime() - prev.timestamp.getTime()) / (1000 * 60);

        if (gapMinutes > config.buffer.conversationGapMinutes) {
          if (currentChunk.length >= 2) {
            chunks.push({
              channelId,
              messages: [...currentChunk],
              startTime: currentChunk[0].timestamp,
              endTime: currentChunk[currentChunk.length - 1].timestamp,
            });
          }
          currentChunk = [curr];
        } else {
          currentChunk.push(curr);
        }
      }

      // Add last chunk if valid and "done" (gap has passed since last message)
      const lastMsg = currentChunk[currentChunk.length - 1];
      const timeSinceLast = (Date.now() - lastMsg.timestamp.getTime()) / (1000 * 60);

      if (currentChunk.length >= 2 && timeSinceLast > config.buffer.conversationGapMinutes) {
        chunks.push({
          channelId,
          messages: [...currentChunk],
          startTime: currentChunk[0].timestamp,
          endTime: currentChunk[currentChunk.length - 1].timestamp,
        });
        // Clear processed messages from main buffer to avoid re-processing
        // We only clear if we actually created a chunk, suggesting this "conversation" is done
        buffer.messages = [];
      }
    }

    // --- 2. Process Threads ---
    for (const [threadTs, threadData] of buffer.threads) {
      const threadMessages = filterMessages(threadData.messages);
      if (threadMessages.length < 2) continue;

      const lastActivity = threadData.lastActivity;
      const gapMinutes = (Date.now() - lastActivity.getTime()) / (1000 * 60);

      // If thread is "done" (gap passed)
      if (gapMinutes > config.buffer.conversationGapMinutes) {
        chunks.push({
          channelId,
          messages: threadMessages,
          startTime: threadMessages[0].timestamp,
          endTime: threadMessages[threadMessages.length - 1].timestamp,
        });

        // Remove processed thread
        buffer.threads.delete(threadTs);
      }
    }

    return chunks;
  }

  getAllPendingChunks(): ConversationChunk[] {
    const channelsToEvaluate = this.getChannelsToEvaluate();
    const allChunks: ConversationChunk[] = [];

    for (const channelId of channelsToEvaluate) {
      const chunks = this.getConversationChunks(channelId);
      allChunks.push(...chunks);
      this.markChannelEvaluated(channelId);
    }

    return allChunks;
  }

  markChannelEvaluated(channelId: string): void {
    const buffer = this.getBuffer(channelId);
    buffer.lastEvaluationTime = new Date();
    buffer.messagesSinceLastEvaluation = 0;
  }

  getMessageCount(channelId: string): number {
    const buffer = this.getBuffer(channelId);
    let count = buffer.messages.length;
    for (const t of buffer.threads.values()) count += t.messages.length;
    return count;
  }

  getTotalMessageCount(): number {
    let total = 0;
    for (const id of this.buffers.keys()) {
      total += this.getMessageCount(id);
    }
    return total;
  }

  clearChannel(channelId: string): void {
    this.buffers.delete(channelId);
  }

  clearAll(): void {
    this.buffers.clear();
  }
}

// Singleton instance
export const messageBuffer = new MessageBufferManager();
