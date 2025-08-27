import { MessageReaction, PartialMessageReaction, User } from "discord.js";
import { zap } from "../handlers/zap.js";
import { trackSatsSent } from "../handlers/ranking.js";
import { log } from "../handlers/log.js";
import { ExtendedClient } from "types/discord.js";
import { getAccountInternal } from "../handlers/accounts.js";

const once = false;
const name = "messageReactionAdd";
const zapEmoji = "⚡";

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

    const zapMessage = `${user.username} zapeó tu mensaje de discord`;

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
  } catch (err: any) {
    log(
      `Error in zap reaction from @${user.username} - Error code ${err.code} Message: ${err.message}`,
      "err"
    );
  }
}

export { once, name, invoke };
