import {
  EmbedBuilder,
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { getAccount, checkBotAccountFunds } from "../handlers/accounts.js";
import { formatter } from "../utils/helperFormatter.js";
import { log } from "../handlers/log.js";
import { EphemeralMessageResponse } from "../utils/helperFunctions.js";
import { AccountResult } from "../types/index.js";
import { BOT_CONFIG } from "#utils/config";

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

    const balance: number = Math.floor(response.balance / 1000);

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

    const userLud16 = nwcClient.lud16;
    const botLud16 = BOT_CONFIG.LIGHTNING_DOMAIN ? `${user.username}@${BOT_CONFIG.LIGHTNING_DOMAIN}` : null;

    if (userLud16 || botLud16) {
      const lightningAddresses = [];

      if (userLud16) {
        lightningAddresses.push(`⚡ ${userLud16}`);
      }

      if (botLud16) {
        lightningAddresses.push(`⚡ ${botLud16}`);
      }

      embed.addFields([
        {
          name: "**Lightning Address**",
          value: lightningAddresses.join('\n'),
        }
      ]);

      if (botLud16) {
        const footerText = accountResult.isServiceAccount 
          ? "Payments to the bot address will be received in your custodial wallet"
          : "Payments to the bot address will be received in your connected wallet";
        
        embed.setFooter({
          text: footerText
        });
      }
    }

    const components: any[] = [];

    if (accountResult.isServiceAccount) {
      embed.addFields([
        {
          name: "⚠️ Service Account Notice",
          value: `You're using a custodial wallet created by the bot. A ${(BOT_CONFIG.SERVICE_ACCOUNT_COMMISSION * 100).toFixed(1)}% fee applies to all transfers. Use \`/connect\` to link your own wallet and avoid fees.`,
          inline: false
        }
      ]);
    } else {
      const botFundsResult = await checkBotAccountFunds(user.id);

      if (botFundsResult.hasFunds && botFundsResult.balance) {
        embed.addFields([
          {
            name: "⚠️ Bot Account Funds Available",
            value: `You have **${formatter(0, 0).format(botFundsResult.balance)} sats** remaining in your bot account. Click the button below to transfer them to your connected wallet.`,
            inline: false
          }
        ]);

        const recoverButton = new ButtonBuilder()
          .setCustomId("recover_funds")
          .setLabel("Recovery funds")
          .setStyle(ButtonStyle.Primary)
          .setEmoji("💰");

        const row = new ActionRowBuilder<ButtonBuilder>()
          .addComponents(recoverButton);

        components.push(row);
      }
    }

    log(
      `Balance for @${user.username} resolved: ${balance} satoshis`,
      "info"
    );

    await interaction.editReply({
      embeds: [embed],
      components: components
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
