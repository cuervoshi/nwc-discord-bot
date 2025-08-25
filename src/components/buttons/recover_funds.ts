import { ButtonBuilder, ButtonStyle, ButtonInteraction } from "discord.js";
import { getAccount, transferBotFundsToUser } from "../../handlers/accounts.js";
import { log } from "../../handlers/log.js";
import { EphemeralMessageResponse } from "../../utils/helperFunctions.js";

const create = () => {
  return new ButtonBuilder()
    .setCustomId("recover_funds")
    .setLabel("Recuperar fondos")
    .setStyle(ButtonStyle.Primary)
    .setEmoji("💰");
};

const customId = "recover_funds";

const invoke = async (interaction: ButtonInteraction) => {
  try {
    await interaction.deferReply({ ephemeral: true });

    const user = interaction.user;
    if (!user) {
      return EphemeralMessageResponse(interaction, "❌ **Error: No user found.**");
    }

    log(`@${user.username} clicked recover funds button`, "info");

    const accountResult = await getAccount(interaction, user.id);
    
    if (!accountResult.success) {
      return EphemeralMessageResponse(interaction, accountResult.message || "❌ **Failed to get your account.**");
    }

    if (!accountResult.nwcClient) {
      return EphemeralMessageResponse(interaction, "❌ **No wallet connection found.**");
    }

    if (accountResult.isServiceAccount) {
      return EphemeralMessageResponse(interaction, "❌ **You need to connect your own wallet first using `/connect` to recover funds.**");
    }

    const transferResult = await transferBotFundsToUser(user.id);
    
    if (transferResult.success) {
      log(`@${user.username} successfully recovered ${transferResult.transferredAmount} sats`, "info");
      
      await interaction.editReply({
        content: transferResult.message,
        embeds: [],
        components: []
      });
    } else {
      log(`@${user.username} failed to recover funds: ${transferResult.message}`, "err");
      
      await interaction.editReply({
        content: transferResult.message || "❌ **Failed to recover funds.**",
        embeds: [],
        components: []
      });
    }

  } catch (err: any) {
    log(`Error in recover funds button for @${interaction.user.username}: ${err.message}`, "err");
    
    await interaction.editReply({
      content: "❌ **An unexpected error occurred while recovering funds.**",
      embeds: [],
      components: []
    });
  }
};

export { create, invoke, customId };
