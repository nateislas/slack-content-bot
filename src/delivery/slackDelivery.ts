import { App } from '@slack/bolt';
import { DraftSuggestion } from '../types';
import { config } from '../config';

/**
 * Build a Slack message link from channel ID and message timestamp
 */
function buildMessageLink(channelId: string, messageTs: string): string {
  if (!config.slack.workspaceDomain) {
    return '';
  }
  // Slack links use timestamp without the dot
  const tsForLink = messageTs.replace('.', '');
  return `https://${config.slack.workspaceDomain}.slack.com/archives/${channelId}/p${tsForLink}`;
}

/**
 * Format a draft suggestion as Slack blocks
 */
function formatSuggestionBlocks(suggestion: DraftSuggestion): any[] {
  const strengthEmoji = {
    high: '🟢',
    medium: '🟡',
    low: '🟠',
  };

  const blocks: any[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: '📣 Content Opportunity Detected!',
        emoji: true,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*💡 Topic:* ${suggestion.opportunity.topic}`,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*📍 Channel:* #${suggestion.channelName}`,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${strengthEmoji[suggestion.opportunity.strength]} Strength:* ${suggestion.opportunity.strength.toUpperCase()}\n_${suggestion.opportunity.strengthReasoning}_`,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Why it works:* ${suggestion.opportunity.whyCompelling}`,
      },
    },
    {
      type: 'divider',
    },
    {
      type: 'section',
      block_id: 'linkedin_draft',
      text: {
        type: 'mrkdwn',
        text: `*🔗 LinkedIn Draft:*\n\`\`\`${suggestion.linkedInDraft}\`\`\``,
      },
    },
    {
      type: 'section',
      block_id: 'x_draft',
      text: {
        type: 'mrkdwn',
        text: `*🐦 X/Twitter Draft:*\n\`\`\`${suggestion.xDraft}\`\`\``,
      },
    },
    {
      type: 'divider',
    },
  ];

  // Build context with time range and optional source link
  const startTime = suggestion.opportunity.originalMessages[0].timestamp.toLocaleTimeString();
  const endTime = suggestion.opportunity.originalMessages[suggestion.opportunity.originalMessages.length - 1].timestamp.toLocaleTimeString();

  let contextText = `_Conversation from ${startTime} - ${endTime}_`;
  if (suggestion.sourceLink) {
    contextText += ` | <${suggestion.sourceLink}|View in Slack>`;
  }

  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: contextText,
      },
    ],
  });

  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: {
          type: 'plain_text',
          text: '✅ Save for Later',
          emoji: true,
        },
        style: 'primary',
        action_id: 'save_suggestion',
      },
      {
        type: 'button',
        text: {
          type: 'plain_text',
          text: '✏️ Edit',
          emoji: true,
        },
        action_id: 'edit_suggestion',
      },

      {
        type: 'button',
        text: {
          type: 'plain_text',
          text: '👎 Dismiss with Feedback',
          emoji: true,
        },
        action_id: 'dismiss_with_feedback',
      },
      {
        type: 'button',
        text: {
          type: 'plain_text',
          text: '❌ Dismiss',
          emoji: true,
        },
        action_id: 'dismiss_suggestion',
      },
    ],
  });

  return blocks;
}

/**
 * Post a suggestion to the content ideas channel
 */
export async function postSuggestion(
  app: App,
  suggestion: DraftSuggestion
): Promise<void> {
  try {
    await app.client.chat.postMessage({
      channel: config.slack.contentIdeasChannelId,
      text: `📣 Content Opportunity: ${suggestion.opportunity.topic}`,
      blocks: formatSuggestionBlocks(suggestion),
    });

    console.log(`✅ Posted suggestion to #content-ideas: ${suggestion.opportunity.topic}`);
  } catch (error) {
    console.error('Error posting suggestion to Slack:', error);
    throw error;
  }
}

export { buildMessageLink };
