import { SlashCommandBuilder, EmbedBuilder, ChatInputCommandInteraction } from "discord.js";
import { disconnectAccount } from "../handlers/accounts.js";
import { log } from "../handlers/log.js";

const create = () => {
  const command = new SlashCommandBuilder()
    .setName("disconnect")
    .setDescription("Disconnect your wallet from the bot.");

  return command.toJSON();
};

const invoke = async (interaction: ChatInputCommandInteraction) => {
  try {
    await interaction.deferReply({ ephemeral: true });

    const user = interaction.user;
    if (!user) throw new Error("No user interaction found");

    log(`@${user.username} attempted to disconnect their wallet`, "info");

    const disconnectResult = await disconnectAccount(user.id);
    
    if (!disconnectResult.success) {
      log(`@${user.username} - Disconnect failed: ${disconnectResult.message}`, "err");
      return await interaction.editReply({
        content: disconnectResult.message || "❌ **Failed to disconnect your wallet.**"
      });
    }

    const embed = new EmbedBuilder()
      .setAuthor({
        name: "Wallet disconnected successfully",
        iconURL: `https://cdn.discordapp.com/avatars/${interaction.user.id}/${interaction.user.avatar}`,
      })
      .setColor(0x00ff00)
      .addFields([
        {
          name: "Status",
          value: "✅ Wallet disconnected successfully",
        },
        {
          name: "What happens now?",
          value: "• Your personal wallet connection has been removed\n• The bot will use your service account for transactions\n• You can reconnect anytime using `/connect`\n• Your service account remains active",
        },
      ]);

    log(`@${user.username} successfully disconnected their wallet`, "info");

    await interaction.editReply({
      embeds: [embed]
    });

  } catch (err: any) {
    log(
      `Error in /disconnect command executed by @${interaction.user.username} - Error code ${err.code} Message: ${err.message}`,
      "err"
    );

    await interaction.editReply({
      content: "❌ An unexpected error occurred while disconnecting your wallet",
    });
  }
};

export { create, invoke };
