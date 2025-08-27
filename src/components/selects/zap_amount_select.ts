import { StringSelectMenuInteraction } from "discord.js";
import { log } from "../../handlers/log.js";
import { getAccountInternal } from "../../handlers/accounts.js";
import { EphemeralMessageResponse } from "../../utils/helperFunctions.js";
import { createZapConfigEmbed, createZapConfigComponents } from "../../utils/helperZapConfig.js";
import { updateZapConfiguration } from "../../handlers/zapConfig.js";

const customId = "zap_amount_select";

const invoke = async (interaction: StringSelectMenuInteraction): Promise<void> => {
  try {
    const selectedAmount = parseInt(interaction.values[0]);
    
    log(`@${interaction.user.username} selected zap amount: ${selectedAmount}`, "info");

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
      amount: selectedAmount
    });

    if (!updateResult.success) {
      await EphemeralMessageResponse(interaction, `❌ **Update failed:** ${updateResult.error}`);
      return;
    }

    // Update the original message with new configuration
    const updatedEmbed = createZapConfigEmbed({
      isEnabled: userAccount.zapReaction_enabled || false,
      zapAmount: selectedAmount,
      userId: interaction.user.id,
      userAvatar: interaction.user.avatar || ''
    });

    const updatedComponents = createZapConfigComponents(userAccount.zapReaction_enabled || false, selectedAmount);

    await interaction.update({
      embeds: [updatedEmbed],
      components: updatedComponents
    });

  } catch (err: any) {
    log(
      `Error in zap amount select for @${interaction.user.username} - Error code ${err.code} Message: ${err.message}`,
      "err"
    );

    await EphemeralMessageResponse(interaction, "❌ An unexpected error occurred while updating your configuration");
  }
};

export { invoke, customId };
