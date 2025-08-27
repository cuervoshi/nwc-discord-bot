import { StringSelectMenuInteraction } from "discord.js";
import { log } from "../../handlers/log.js";
import { getAccountInternal } from "../../handlers/accounts.js";
import { EphemeralMessageResponse } from "../../utils/helperFunctions.js";
import { createZapConfigEmbed, createZapConfigComponents } from "../../utils/helperZapConfig.js";
import { updateZapConfiguration } from "../../handlers/zapConfig.js";

const customId = "zap_status_select";

const invoke = async (interaction: StringSelectMenuInteraction): Promise<void> => {
  try {
    const selectedStatus = interaction.values[0];
    const isEnabled = selectedStatus === 'enabled';
    
    log(`@${interaction.user.username} selected zap status: ${selectedStatus}`, "info");

    // Get user account to verify it exists
    const accountResult = await getAccountInternal(interaction.user.id, interaction.user.username, true);
    if (!accountResult.success) {
      await EphemeralMessageResponse(interaction, accountResult.message || "Unknown error");
      return;
    }

    const userAccount = accountResult.userAccount;
    if (!userAccount) {
      await EphemeralMessageResponse(interaction, "❌ **Account not found.**\n\nPlease use `/connect` to connect your wallet first.");
      return;
    }

    // Update the zap configuration
    const updateResult = await updateZapConfiguration(interaction.user.id, {
      enabled: isEnabled
    });

    if (!updateResult.success) {
      await EphemeralMessageResponse(interaction, `❌ **Update failed:** ${updateResult.error}`);
      return;
    }

    // Update the original message with new configuration
    const updatedEmbed = createZapConfigEmbed({
      isEnabled: isEnabled,
      zapAmount: userAccount.zapReaction_amount || 21,
      userId: interaction.user.id,
      userAvatar: interaction.user.avatar || ''
    });

    const updatedComponents = createZapConfigComponents(isEnabled, userAccount.zapReaction_amount || 21);

    await interaction.update({
      embeds: [updatedEmbed],
      components: updatedComponents
    });

  } catch (err: any) {
    log(
      `Error in zap status select for @${interaction.user.username} - Error code ${err.code} Message: ${err.message}`,
      "err"
    );

    await EphemeralMessageResponse(interaction, "❌ An unexpected error occurred while updating your configuration");
  }
};

export { invoke, customId };
