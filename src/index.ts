import { App, LogLevel } from '@slack/bolt';
import { config } from './config';
import { messageBuffer } from './buffer/messageBuffer';
import { detectContentOpportunity } from './detector/contentDetector';
import { generateDrafts } from './drafts/draftGenerator';
import { postSuggestion, buildMessageLink } from './delivery/slackDelivery';
import { feedbackManager } from './feedback/feedbackManager';
import { BufferedMessage } from './types';

// Initialize Slack app with Socket Mode
const app = new App({
  token: config.slack.botToken,
  appToken: config.slack.appToken,
  socketMode: true,
  logLevel: LogLevel.INFO,
});

// Store user ID to name mapping
const userCache: Map<string, string> = new Map();

// Store channel ID to name mapping
const channelCache: Map<string, string> = new Map();

/**
 * Get user's display name from Slack
 */
async function getUserName(userId: string): Promise<string> {
  if (userCache.has(userId)) {
    return userCache.get(userId)!;
  }

  try {
    const result = await app.client.users.info({ user: userId });
    const name = result.user?.real_name || result.user?.name || userId;
    userCache.set(userId, name);
    return name;
  } catch (error) {
    console.error(`Error fetching user info for ${userId}:`, error);
    return userId;
  }
}

/**
 * Get channel name from Slack
 */
async function getChannelName(channelId: string): Promise<string> {
  if (channelCache.has(channelId)) {
    return channelCache.get(channelId)!;
  }

  try {
    const result = await app.client.conversations.info({ channel: channelId });
    const name = result.channel?.name || channelId;
    channelCache.set(channelId, name);
    return name;
  } catch (error) {
    console.error(`Error fetching channel info for ${channelId}:`, error);
    return channelId;
  }
}

// Export for use in delivery module
export { getChannelName, app };

/**
 * Process the buffer - detect content and generate suggestions
 */
async function processBuffer(): Promise<void> {
  console.log('🔍 Evaluating conversation buffer...');

  const chunks = messageBuffer.getAllPendingChunks();

  if (chunks.length === 0) {
    console.log('📭 No meaningful conversation chunks to analyze');
    return;
  }

  for (const chunk of chunks) {
    console.log(`📝 Analyzing chunk from channel ${chunk.channelId} with ${chunk.messages.length} messages...`);

    // Detect content opportunity
    const opportunity = await detectContentOpportunity(chunk);

    if (!opportunity) {
      console.log('❌ No content opportunity detected in this chunk');
      continue;
    }

    console.log(`✨ Found opportunity: ${opportunity.topic} (${opportunity.strength})`);

    // Check if strength meets threshold
    const strengthValue = { low: 1, medium: 2, high: 3 };
    const minStrength = config.slack.minStrengthToPost;

    if (strengthValue[opportunity.strength] < strengthValue[minStrength]) {
      console.log(`⏭️ Skipping opportunity with strength '${opportunity.strength}' (needs '${minStrength}')`);
      continue;
    }

    // Get channel name for display
    const channelName = await getChannelName(chunk.channelId);

    // Build source link to first message
    const firstMessage = opportunity.originalMessages[0];
    const sourceLink = buildMessageLink(chunk.channelId, firstMessage.ts);

    // Generate drafts
    const suggestion = await generateDrafts(opportunity);

    if (!suggestion) {
      console.log('❌ Failed to generate drafts');
      continue;
    }

    // Add channel name and source link
    suggestion.channelName = channelName;
    suggestion.sourceLink = sourceLink;

    // Post to #content-ideas
    await postSuggestion(app, suggestion);
  }
}

// Listen for messages in the watched channel
app.message(async ({ message, say }) => {
  // Type guard for regular messages
  if (message.subtype !== undefined) {
    return; // Skip bot messages, edits, etc.
  }

  // Only process messages from watched channels
  if (!config.slack.watchChannelIds.includes(message.channel)) {
    return;
  }

  // Get user info
  const userName = await getUserName(message.user!);

  // Create buffered message
  const bufferedMessage: BufferedMessage = {
    ts: message.ts,
    channelId: message.channel,
    userId: message.user!,
    userName,
    text: message.text || '',
    timestamp: new Date(parseFloat(message.ts) * 1000),
    threadTs: message.thread_ts,
  };

  // Add to buffer
  messageBuffer.addMessage(bufferedMessage);
  console.log(`💬 [${message.channel}] ${userName}: ${bufferedMessage.text.substring(0, 50)}...`);

  // Check if we should evaluate
  if (messageBuffer.shouldEvaluate()) {
    await processBuffer();
  }
});

// Handle button interactions
app.action('save_suggestion', async ({ ack, body, client }) => {
  await ack();
  // TODO: Save to database or external system
  await client.chat.postEphemeral({
    channel: body.channel?.id || config.slack.contentIdeasChannelId,
    user: body.user.id,
    text: '✅ Suggestion saved! (Note: Persistence not yet implemented)',
  });
});

app.action('edit_suggestion', async ({ ack, body, client }) => {
  await ack();

  if (body.type !== 'block_actions' || !body.message) {
    return;
  }

  // Parse current drafts from blocks
  const blocks = body.message.blocks;
  const linkedinDraft = extractDraft(blocks, 'linkedin_draft');
  const xDraft = extractDraft(blocks, 'x_draft');

  try {
    await client.views.open({
      trigger_id: body.trigger_id,
      view: {
        type: 'modal',
        callback_id: 'edit_drafts_modal',
        private_metadata: JSON.stringify({
          channelId: body.channel?.id,
          messageTs: body.message.ts,
        }),
        title: {
          type: 'plain_text',
          text: 'Edit Drafts',
        },
        blocks: [
          {
            type: 'input',
            block_id: 'linkedin_block',
            element: {
              type: 'plain_text_input',
              action_id: 'linkedin_input',
              multiline: true,
              initial_value: linkedinDraft,
            },
            label: {
              type: 'plain_text',
              text: 'LinkedIn Draft',
            },
          },
          {
            type: 'input',
            block_id: 'x_block',
            element: {
              type: 'plain_text_input',
              action_id: 'x_input',
              multiline: true,
              initial_value: xDraft,
            },
            label: {
              type: 'plain_text',
              text: 'X/Twitter Draft',
            },
          },
        ],
        submit: {
          type: 'plain_text',
          text: 'Update',
        },
      },
    });
  } catch (error) {
    console.error('Error opening modal:', error);
  }
});

// Handle modal submission
app.view('edit_drafts_modal', async ({ ack, body, view, client }) => {
  await ack();

  const { channelId, messageTs } = JSON.parse(view.private_metadata);
  const updatedLinkedIn = view.state.values.linkedin_block.linkedin_input.value || '';
  const updatedX = view.state.values.x_block.x_input.value || '';

  try {
    // Get the original message to preserve other blocks
    const result = await client.conversations.history({
      channel: channelId,
      latest: messageTs,
      inclusive: true,
      limit: 1,
    });

    const originalMessage = result.messages?.[0];
    if (!originalMessage || !originalMessage.blocks) {
      throw new Error('Could not find original message');
    }

    // Update the blocks with new draft content
    const updatedBlocks = originalMessage.blocks.map((block: any) => {
      if (block.block_id === 'linkedin_draft') {
        return {
          ...block,
          text: {
            ...block.text,
            text: `*🔗 LinkedIn Draft:*\n\`\`\`${updatedLinkedIn}\`\`\``,
          },
        };
      }
      if (block.block_id === 'x_draft') {
        return {
          ...block,
          text: {
            ...block.text,
            text: `*🐦 X/Twitter Draft:*\n\`\`\`${updatedX}\`\`\``,
          },
        };
      }
      return block;
    });

    // Update the message
    await client.chat.update({
      channel: channelId,
      ts: messageTs,
      text: originalMessage.text || 'Draft Updated',
      blocks: updatedBlocks,
    });

    // Notify the user ephemerally
    await client.chat.postEphemeral({
      channel: channelId,
      user: body.user.id,
      text: '✅ Drafts updated successfully!',
    });
  } catch (error) {
    console.error('Error updating message:', error);
    // Notify the user of failure
    await client.chat.postEphemeral({
      channel: channelId,
      user: body.user.id,
      text: '❌ Failed to update drafts. Please try again.',
    });
  }
});

/**
 * Helper to extract draft content from blocks
 */
function extractDraft(blocks: any[], blockId: string): string {
  const block = blocks.find((b: any) => b.block_id === blockId);
  if (block && block.text && block.text.text) {
    const text = block.text.text;
    const match = text.match(/```([\s\S]*?)```/);
    return match ? match[1].trim() : '';
  }
  return '';
}

/**
 * Handle Dismiss with Feedback
 */
app.action('dismiss_with_feedback', async ({ ack, body, client }) => {
  await ack();

  if (body.type !== 'block_actions' || !body.message) {
    return;
  }

  // Extract topic from blocks if possible, or just pass message ID
  // We can extract topic from the second block which is usually "Topic: ..."
  let topic = 'Unknown Topic';
  const blocks = body.message.blocks;
  if (blocks && blocks[1] && blocks[1].text && blocks[1].text.text) {
    const match = blocks[1].text.text.match(/\*💡 Topic:\* (.*)/);
    if (match) topic = match[1];
  }

  try {
    await client.views.open({
      trigger_id: body.trigger_id,
      view: {
        type: 'modal',
        callback_id: 'feedback_modal_submission',
        private_metadata: JSON.stringify({
          channelId: body.channel?.id,
          messageTs: body.message.ts,
          topic: topic,
        }),
        title: {
          type: 'plain_text',
          text: 'Provide Feedback',
        },
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `Help us improve future suggestions for topic:\n*${topic}*`,
            },
          },
          {
            type: 'input',
            block_id: 'reasons_block',
            element: {
              type: 'checkboxes',
              action_id: 'reasons_action',
              options: [
                {
                  text: { type: 'plain_text', text: 'Topic not interesting' },
                  value: 'Topic not interesting',
                },
                {
                  text: { type: 'plain_text', text: 'Draft sounded too robotic' },
                  value: 'Draft sounded too robotic',
                },
                {
                  text: { type: 'plain_text', text: 'Inaccurate / Hallucinated' },
                  value: 'Inaccurate / Hallucinated',
                },
                {
                  text: { type: 'plain_text', text: 'Too generic / No unique insight' },
                  value: 'Too generic / No unique insight',
                },
              ],
            },
            label: {
              type: 'plain_text',
              text: 'Why isn\'t this working?',
            },
          },
          {
            type: 'input',
            block_id: 'comment_block',
            optional: true,
            element: {
              type: 'plain_text_input',
              action_id: 'comment_action',
              multiline: true,
              placeholder: {
                type: 'plain_text',
                text: 'E.g., "Don\'t use emojis", "Focus on metrics more"',
              },
            },
            label: {
              type: 'plain_text',
              text: 'Any specific feedback?',
            },
          },
        ],
        submit: {
          type: 'plain_text',
          text: 'Dismiss & Learn',
        },
      },
    });
  } catch (error) {
    console.error('Error opening feedback modal:', error);
  }
});

/**
 * Handle Feedback Submission
 */
app.view('feedback_modal_submission', async ({ ack, body, view, client }) => {
  await ack();

  const { channelId, messageTs, topic } = JSON.parse(view.private_metadata);

  // Extract values
  const selectedOptions = view.state.values.reasons_block.reasons_action.selected_options || [];
  const reasons = selectedOptions.map((opt: any) => opt.value);
  const comment = view.state.values.comment_block.comment_action.value || '';

  // Save to feedback manager
  feedbackManager.addFeedback({
    timestamp: new Date().toISOString(),
    type: 'dismiss',
    originalTopic: topic,
    reasons: reasons,
    comment: comment,
  });

  try {
    // Delete the original message
    await client.chat.delete({
      channel: channelId,
      ts: messageTs,
    });

    // Post ephemeral confirmation
    await client.chat.postEphemeral({
      channel: channelId,
      user: body.user.id,
      text: '🙏 Thanks! Feedback saved and suggestion dismissed.',
    });
  } catch (error) {
    console.error('Error handling feedback submission:', error);
  }
});
app.action('dismiss_suggestion', async ({ ack, body, client, respond }) => {
  await ack();
  // Delete the original message
  if (body.type === 'block_actions' && body.message) {
    try {
      await client.chat.delete({
        channel: body.channel?.id || config.slack.contentIdeasChannelId,
        ts: body.message.ts,
      });
    } catch (error) {
      console.error('Error deleting message:', error);
    }
  }
});

// Periodic check for conversation gaps (every 2 minutes)
setInterval(async () => {
  if (messageBuffer.shouldEvaluate()) {
    await processBuffer();
  }
}, 2 * 60 * 1000);

// Start the app
(async () => {
  await app.start();
  console.log('⚡️ Slack Content Bot is running!');
  console.log(`👀 Watching channels: ${config.slack.watchChannelIds.join(', ')}`);
  console.log(`📢 Posting to: ${config.slack.contentIdeasChannelId}`);
})();
