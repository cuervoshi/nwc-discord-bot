import { SlashCommandBuilder, EmbedBuilder, ChatInputCommandInteraction } from "discord.js";
import { connectAccount } from "../handlers/accounts.js";
import {
  validateNWCURI,
  testNWCConnection,
} from "../utils/helperFunctions.js";
import { log } from "../handlers/log.js";
import { ValidationResult, ConnectionTestResult } from "../types/index.js";
import { formatter } from "#utils/helperFormatter";

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
          value: `**${formatter(0, 0).format(connectionTest.balance)} satoshis**`,
        },
      ]);

    log(`@${user.username} successfully connected with NWC - Balance: ${connectionTest.balance} sats`, "info");

    await interaction.editReply({
      embeds: [embed],
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
