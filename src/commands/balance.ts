import {
  EmbedBuilder,
  SlashCommandBuilder,
  ChatInputCommandInteraction,
} from "discord.js";
import { getAccount } from "../handlers/accounts.js";
import { formatter } from "../utils/helperFormatter.js";
import { log } from "../handlers/log.js";
import { EphemeralMessageResponse } from "../utils/helperFunctions.js";
import { AccountResult } from "../types/index.js";

interface BalanceResponse {
  balance: number;
}

const create = () => {
  const command = new SlashCommandBuilder()
    .setName("balance")
    .setDescription("Returns your wallet balance.");

  return command.toJSON();
};

const invoke = async (interaction: ChatInputCommandInteraction) => {
  try {
    await interaction.deferReply({ ephemeral: true });

    const user = interaction.user;
    if (!user) throw new Error("No user interaction found");

    log(`@${user.username} used /balance`, "info");

    const accountResult: AccountResult = await getAccount(interaction, user.id);
    if (!accountResult.success) {
      return EphemeralMessageResponse(interaction, accountResult.message || "Unknown error");
    }

    if (!accountResult.nwcClient) {
      throw new Error("Could not get NWC client");
    }

    const { nwcClient } = accountResult;
    const response: BalanceResponse = await nwcClient.getBalance();
    
    if (!response) {
      throw new Error("Error getting balance");
    }
    
    const balance: number = response.balance / 1000;

    const embed = new EmbedBuilder()
      .setAuthor({
        name: "Your Account Information",
        iconURL: `https://cdn.discordapp.com/avatars/${interaction.user.id}/${interaction.user.avatar}`,
      })
      .addFields([
        {
          name: "Balance",
          value: `**${formatter(0, 0).format(balance)} satoshis**`,
        }
      ]);

    log(
      `Balance for @${user.username} resolved: ${balance} satoshis`,
      "info"
    );

    await interaction.editReply({
      embeds: [embed],
    });

  } catch (err: any) {
    log(
      `Error in /balance command executed by @${interaction.user.username} - Error code ${err.code} Message: ${err.message}`,
      "err"
    );

    await interaction.editReply({
      content: "❌ An unexpected error occurred while getting your balance",
    });
  }
};

export { create, invoke };
