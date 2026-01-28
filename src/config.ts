import dotenv from 'dotenv';
dotenv.config();

export const config = {
  slack: {
    botToken: process.env.SLACK_BOT_TOKEN!,
    appToken: process.env.SLACK_APP_TOKEN!,
    signingSecret: process.env.SLACK_SIGNING_SECRET!,
    watchChannelIds: (process.env.WATCH_CHANNEL_IDS || '').split(',').map(id => id.trim()).filter(Boolean),
    contentIdeasChannelId: process.env.CONTENT_IDEAS_CHANNEL_ID!,
    workspaceDomain: process.env.SLACK_WORKSPACE_DOMAIN || '',
    minStrengthToPost: (process.env.MIN_STRENGTH_TO_POST || 'medium') as 'low' | 'medium' | 'high',
  },
  llm: {
    provider: (process.env.LLM_PROVIDER || 'google') as 'google' | 'openai' | 'anthropic',
    model: process.env.LLM_MODEL, // Optional override
    temperature: parseFloat(process.env.TEMPERATURE || '0.7'),
    keys: {
      google: process.env.GOOGLE_API_KEY!,
      openai: process.env.OPENAI_API_KEY || '',
      anthropic: process.env.ANTHROPIC_API_KEY || '',
    }
  },
  privacy: {
    blockedKeywords: (process.env.BLOCKED_KEYWORDS || 'confidential,nda,salary,valuation,runway')
      .split(',')
      .map(k => k.trim().toLowerCase()),
    offRecordEmoji: '🔒',
  },
  buffer: {
    maxMessages: parseInt(process.env.MAX_BUFFER_SIZE || '20', 10),
    evaluationThreshold: parseInt(process.env.EVALUATION_THRESHOLD || '10', 10),
    conversationGapMinutes: parseInt(process.env.CONVERSATION_GAP_MINUTES || '5', 10),
    minMessagesForChunk: parseInt(process.env.MIN_MESSAGES_FOR_CHUNK || '2', 10),
  },
};

// Validate required env vars
const commonRequired = [
  'SLACK_BOT_TOKEN',
  'SLACK_APP_TOKEN',
  'SLACK_SIGNING_SECRET',
  'WATCH_CHANNEL_IDS',
  'CONTENT_IDEAS_CHANNEL_ID',
];

for (const key of commonRequired) {
  if (!process.env[key]) {
    console.error(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

// Validate Provider Specific Keys
const provider = config.llm.provider;
if (provider === 'google' && !config.llm.keys.google) {
  console.error('Missing GOOGLE_API_KEY for Google provider');
  process.exit(1);
}
if (provider === 'openai' && !config.llm.keys.openai) {
  console.error('Missing OPENAI_API_KEY for OpenAI provider');
  process.exit(1);
}
if (provider === 'anthropic' && !config.llm.keys.anthropic) {
  console.error('Missing ANTHROPIC_API_KEY for Anthropic provider');
  process.exit(1);
}
