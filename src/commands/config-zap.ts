import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
} from "discord.js";
import { getAccountInternal } from "../handlers/accounts.js";
import {
  EphemeralMessageResponse,
} from "../utils/helperFunctions.js";
import { log } from "../handlers/log.js";
import { createZapConfigEmbed, createZapConfigComponents } from "../utils/helperZapConfig.js";

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

    const embed = createZapConfigEmbed({
      isEnabled,
      zapAmount,
      userId: interaction.user.id,
      userAvatar: interaction.user.avatar || ''
    });
    
    const components = createZapConfigComponents(isEnabled, zapAmount);
      
    await interaction.editReply({
      embeds: [embed],
      components,
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
