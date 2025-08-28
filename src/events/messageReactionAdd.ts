import { MessageReaction, PartialMessageReaction, User } from "discord.js";
import { zap } from "../handlers/zap.js";
import { trackSatsSent } from "../handlers/ranking.js";
import { log } from "../handlers/log.js";
import { ExtendedClient } from "types/discord.js";
import { getAccountInternal } from "../handlers/accounts.js";
import { SimpleLock } from "../handlers/SimpleLock.js";

const once = false;
const name = "messageReactionAdd";
const zapEmoji = "⚡";

interface ZapQueueItem {
  user: User;
  reaction: MessageReaction | PartialMessageReaction;
  receiver: any;
  userZapAmount: number;
  zapMessage: string;
}

const userZapLocks = new Map<string, SimpleLock>();
const userZapQueues = new Map<string, ZapQueueItem[]>();
const userProcessingMessages = new Map<string, Set<string>>();

const getUserZapLock = (userId: string): SimpleLock => {
  if (!userZapLocks.has(userId)) {
    userZapLocks.set(userId, new SimpleLock());
  }
  return userZapLocks.get(userId)!;
};

const processUserZapQueue = async (userId: string): Promise<void> => {
  const queue = userZapQueues.get(userId) || [];
  
  while (queue.length > 0) {
    const { user, reaction, receiver, userZapAmount, zapMessage } = queue.shift()!;
    const lock = getUserZapLock(userId);
    const release = await lock.acquire();
    
    log(`Lock reaction acquired for user ${userId} - Processing zap`, "info");
    
    try {
      await processZap(user, reaction, receiver, userZapAmount, zapMessage);
    } finally {
      log(`Lock reaction released for user ${userId}`, "info");
      release();
    }
  }
};

const processZap = async (
  user: User, 
  reaction: MessageReaction | PartialMessageReaction, 
  receiver: any, 
  userZapAmount: number, 
  zapMessage: string
): Promise<void> => {
  const messageId = reaction.message.id;
  
  try {
    const result = await zap(
      null,
      user,
      receiver,
      userZapAmount,
      zapMessage
    );

    if (result.success) {
      try {
        await trackSatsSent(user.id, userZapAmount);

        log(
          `@${user.username} paid the zap invoice to @${receiver.username}`,
          "info"
        );

        if (reaction.message.channel && reaction.message.channel.isTextBased() && 'send' in reaction.message.channel) {
          await (reaction.message.channel as any).send({
            content: `⚡ ${user.toString()} zapped you with ${userZapAmount} sats for this message`,
            reply: {
              messageReference: reaction.message.id
            }
          });
        }
      } catch (err: any) {
        log(`Error tracking zap for @${user.username}: ${err.message}`, "err");
      }
    } else {
      log(
        `@${user.username} failed to pay zap invoice to @${receiver.username}: ${result.message}`,
        "err"
      );

      try {
        await user.send(`❌ **Zap by reaction failed**\n\nYour zap of ${userZapAmount} sats to @${receiver.username} failed.\n\n**Error:** ${result.message}`);
      } catch (dmError: any) {
        log(`Could not send DM to ${user.username}: ${dmError.message}`, "warn");
      }
    }
  } finally {
    const userMessages = userProcessingMessages.get(user.id);
    if (userMessages) {
      userMessages.delete(messageId);
      if (userMessages.size === 0) {
        userProcessingMessages.delete(user.id);
      }
    }
  }
};

async function invoke(client: ExtendedClient, reaction: MessageReaction | PartialMessageReaction, user: User) {
  log(`🎯 messageReactionAdd event invoked!`, "info");

  try {
    // Handle partial user
    if (user.partial) {
      try {
        log(`Fetching partial user ${user.id}...`, "info");
        await user.fetch();
        log(`User fetched successfully: ${user.username}`, "info");
      } catch (err) {
        log(`Error fetching partial user: ${err}`, "err");
        return;
      }
    }

    if (user.bot) {
      log(`Bot reaction ignored: ${user.username}`, "info");
      return;
    }

    // Handle partial reaction
    if (reaction.partial) {
      try {
        log(`Fetching partial reaction...`, "info");
        await reaction.fetch();
        log(`Reaction fetched successfully`, "info");
      } catch (error) {
        log(`Error fetching partial reaction: ${error}`, "err");
        return;
      }
    }

    const emojiName = reaction.emoji.name;
    if (emojiName !== zapEmoji) {
      return;
    }

    log(`Reaction event triggered: ${user.username} reacted with ${reaction.emoji}`, "info");

    const messageId = reaction.message.id;

    const userMessages = userProcessingMessages.get(user.id);
    if (userMessages && userMessages.has(messageId)) {
      log(`User ${user.username} already processing zap for message ${messageId}, sending DM`, "info");
      try {
        await user.send(`⚠️ **Zap already in progress**\n\nYou cannot zap the same message multiple times while it's being processed. Please wait for the current zap to complete.`);
      } catch (dmError: any) {
        log(`Could not send DM to ${user.username}: ${dmError.message}`, "warn");
      }
      return;
    }

    let userZapAmount = 0;
    try {
      const userNWC = await getAccountInternal(user.id, user.username, true);

      if (!userNWC.success) {
        log(`User ${user.username} has no account, zap reaction ignored`, "info");
        return;
      }

      if (!userNWC.userAccount?.zapReaction_enabled) {
        log(`User ${user.username} has zap reactions disabled, ignoring`, "info");
        return;
      }

      userZapAmount = userNWC.userAccount.zapReaction_amount;
      log(`User ${userNWC.userAccount.discord_username} has zap reactions enabled with amount: ${userZapAmount}`, "info");
    } catch (configError: any) {
      log(`Error checking zap reaction config for ${user.username}: ${configError.message}`, "err");
      return;
    }

    if (!userZapAmount) {
      log(`No zap amount for emoji: ${emojiName || 'unknown'}`, "info");
      return;
    }

    const receiver = reaction.message.author;
    if (!receiver) {
      log(`No message author found for reaction`, "info");
      return;
    }

    if (reaction.message.channel && reaction.message.channel.isTextBased() && reaction.message.guild) {
      const botMember = reaction.message.guild.members.me;
      if (botMember && !botMember.permissions.has('SendMessages')) {
        log(`Bot lacks SendMessages permission in guild ${reaction.message.guild.id}`, "warn");
        return;
      }
    }

    const zapMessage = `${user.username} zapped your Discord message`;

    if (!userProcessingMessages.has(user.id)) {
      userProcessingMessages.set(user.id, new Set());
    }

    userProcessingMessages.get(user.id)!.add(messageId);

    const zapQueueItem: ZapQueueItem = {
      user,
      reaction,
      receiver,
      userZapAmount,
      zapMessage
    }

    if (!userZapQueues.has(user.id)) {
      userZapQueues.set(user.id, [zapQueueItem]);
    } else {
      userZapQueues.get(user.id).push(zapQueueItem);
    }

    if (userZapQueues.get(user.id).length === 1) {
      processUserZapQueue(user.id);
    }

  } catch (err: any) {
    log(
      `Error in zap reaction from @${user.username} - Error code ${err.code} Message: ${err.message}`,
      "err"
    );
  }
}

export { once, name, invoke };
