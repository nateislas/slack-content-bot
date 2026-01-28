export interface BufferedMessage {
  ts: string;
  channelId: string;
  userId: string;
  userName: string;
  text: string;
  timestamp: Date;
  threadTs?: string;
}

export interface ConversationChunk {
  channelId: string;
  messages: BufferedMessage[];
  startTime: Date;
  endTime: Date;
}

export interface ContentOpportunity {
  topic: string;
  whyCompelling: string;
  keyQuotes: string[];
  strength: 'high' | 'medium' | 'low';
  strengthReasoning: string;
  channelId: string;
  originalMessages: BufferedMessage[];
}

export interface DraftSuggestion {
  opportunity: ContentOpportunity;
  linkedInDraft: string;
  xDraft: string;
  generatedAt: Date;
  channelName: string;
  sourceLink: string;
}
