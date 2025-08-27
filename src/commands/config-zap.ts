import {
  SlashCommandBuilder,
  EmbedBuilder,
  ChatInputCommandInteraction,
  ActionRowBuilder,
  ButtonBuilder,
} from "discord.js";
import { getAccountInternal } from "../handlers/accounts.js";
import {
  EphemeralMessageResponse,
} from "../utils/helperFunctions.js";
import { log } from "../handlers/log.js";

const create = () => {
  const command = new SlashCommandBuilder()
    .setName("config-zap")
    .setDescription("Configure your zap reaction settings");

  return command.toJSON();
};

const invoke = async (interaction: ChatInputCommandInteraction) => {
  try {
    const user = interaction.user;
    if (!user) return;

    await interaction.deferReply({ ephemeral: true });

    log(`@${user.username} executed /config-zap`, "info");

    const accountResult = await getAccountInternal(user.id, user.username, true);
    if (!accountResult.success) {
      await EphemeralMessageResponse(interaction, accountResult.message || "Unknown error");
      return;
    }

    const userAccount = accountResult.userAccount;
    if (!userAccount) {
      await EphemeralMessageResponse(interaction, "❌ **Account not found.**\n\nPlease use `/connect` to connect your wallet first.");
      return;
    }

    const isEnabled = userAccount.zapReaction_enabled || false;
    const zapAmount = userAccount.zapReaction_amount || 21;

    const embed = new EmbedBuilder()
      .setAuthor({
        name: "Zap Reaction Configuration",
        iconURL: `https://cdn.discordapp.com/avatars/${interaction.user.id}/${interaction.user.avatar}`,
      })
      .setDescription(
        `**⚡ Zap Reactions allow you to send satoshis by reacting to messages with the lightning emoji.**\n\n` +
        `**How it works:**\n` +
        `• When you react with ⚡ to any message, you'll automatically send satoshis to the message author\n` +
        `• The amount sent is based on your configuration below\n` +
        `• Only works if you have this feature enabled\n\n` +
        
        `**Your current configuration:**\n` +
        `• **Status:** ${isEnabled ? '✅ Enabled' : '❌ Disabled'}\n` +
        `• **Amount per zap:** ${zapAmount} satoshis\n\n` +
        
        `**Click the button below to edit your configuration.**`
      );
      
    await interaction.editReply({
      embeds: [embed],
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId('edit_zap_config')
            .setLabel('Edit Configuration')
            .setStyle(1)
            .setEmoji('⚙️')
        )
      ],
    });

  } catch (err: any) {
    log(
      `Error in /config-zap command executed by @${interaction.user.username} - Error code ${err.code} Message: ${err.message}`,
      "err"
    );

    await EphemeralMessageResponse(interaction, "❌ An unexpected error occurred");
  }
};

export { create, invoke };
