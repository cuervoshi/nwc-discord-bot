import { SlashCommandBuilder, EmbedBuilder, ChatInputCommandInteraction, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { connectAccount, checkBotAccountFunds } from "../handlers/accounts.js";
import {
  validateNWCURI,
  testNWCConnection,
} from "../utils/helperFunctions.js";
import { log } from "../handlers/log.js";
import { ValidationResult, ConnectionTestResult } from "../types/index.js";
import { formatBalance } from "#utils/helperFormatter";
import { BOT_CONFIG } from "#utils/config";
import { NWCClient } from "@getalby/sdk";

const create = () => {
  const command = new SlashCommandBuilder()
    .setName("connect")
    .setDescription("Connect your wallet through Nostr Wallet Connect.")
    .addStringOption((opt) =>
      opt
        .setName("nwc_uri")
        .setDescription("NWC connection string")
        .setRequired(true)
    );

  return command.toJSON();
};

const invoke = async (interaction: ChatInputCommandInteraction) => {
  try {
    await interaction.deferReply({ ephemeral: true });

    const user = interaction.user;
    if (!user) throw new Error("No user interaction found");

    const nwcUriOption = interaction.options.get('nwc_uri');
    if (!nwcUriOption || typeof nwcUriOption.value !== 'string') {
      throw new Error("NWC URI is required and must be a string");
    }

    const NWC_URI: string = nwcUriOption.value;

    log(`@${user.username} attempted to connect with NWC`, "info");

    const formatValidation: ValidationResult = validateNWCURI(NWC_URI);
    if (!formatValidation.valid) {
      log(`@${user.username} provided an invalid NWC URI: ${formatValidation.error}`, "err");
      return await interaction.editReply({
        content: `❌ **Validation error:** ${formatValidation.error}\n\n**Expected format:**\n\`nostr+walletconnect://<pubkey>?relay=<relay_url>&secret=<secret>\``,
      });
    }

    log(`@${user.username} - Valid NWC URI, testing connection...`, "info");

    const connectionTest: ConnectionTestResult = await testNWCConnection(NWC_URI);
    if (!connectionTest.valid) {
      log(`@${user.username} - NWC connection error: ${connectionTest.error}`, "err");
      return await interaction.editReply({
        content: `❌ **Connection error:** ${connectionTest.error}\n\nVerify that:\n• The URI is correct\n• The wallet is connected\n• The permissions are valid\n• The relay is available`,
      });
    }

    const account = await connectAccount(user.id, user.username, NWC_URI);
    if (!account) {
      log(`@${user.username} - Error creating or updating account`, "err");

      return await interaction.editReply({
        content: "❌ An unexpected error occurred while processing the connection",
      });
    }

    const embed = new EmbedBuilder()
      .setAuthor({
        name: "NWC connection successful",
        iconURL: `https://cdn.discordapp.com/avatars/${interaction.user.id}/${interaction.user.avatar}`,
      })
      .addFields([
        {
          name: "Status",
          value: "Connection established successfully",
        },
        {
          name: "Balance",
          value: `**${formatBalance(connectionTest.balance)} satoshis**`,
        },
      ]);

    const nwcClient = new NWCClient({ nostrWalletConnectUrl: NWC_URI });
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
        embed.setFooter({
          text: "Payments to the bot address will be received in your connected wallet"
        });
      }
    }

    // Create components array for buttons
    const components: any[] = [];

    const botFundsResult = await checkBotAccountFunds(user.id);
    if (botFundsResult.hasFunds && botFundsResult.balance) {
      embed.addFields([
        {
          name: "💰 Bot Account Funds Available",
          value: `You have **${formatBalance(botFundsResult.balance)} sats** remaining in your bot account. Click the button below to transfer them to your connected wallet.`,
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

    log(`@${user.username} successfully connected with NWC - Balance: ${connectionTest.balance} sats`, "info");

    await interaction.editReply({
      embeds: [embed],
      components: components
    });

  } catch (err: any) {
    log(
      `Error in /connect command executed by @${interaction.user.username} - Error code ${err.code} Message: ${err.message}`,
      "err"
    );

    await interaction.editReply({
      content: "❌ An unexpected error occurred while processing the connection",
    });
  }
};

export { create, invoke };
