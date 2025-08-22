import {
  SlashCommandBuilder,
  EmbedBuilder,
  ChatInputCommandInteraction,
  ActionRowBuilder,
  ButtonBuilder,
} from "discord.js";
import { getAndValidateAccount } from "../handlers/accounts.js";
import {
  EphemeralMessageResponse,
} from "../utils/helperFunctions.js";
import { FAUCET_CONFIG } from "../utils/faucetConfig.js";
import { log } from "../handlers/log.js";

interface AccountResult {
  success: boolean;
  message?: string;
  balance?: number;
}

const create = () => {
  const command = new SlashCommandBuilder()
    .setName("gift")
    .setDescription("Create a faucet to gift satoshis to the community");

  return command.toJSON();
};

const invoke = async (interaction: ChatInputCommandInteraction) => {
  try {
    const user = interaction.user;
    if (!user) return;

    await interaction.deferReply({ ephemeral: true });

    log(`@${user.username} executed /gift`, "info");

    const accountResult: AccountResult = await getAndValidateAccount(interaction, user.id);
    if (!accountResult.success) {
      await EphemeralMessageResponse(interaction, accountResult.message || "Unknown error");
      return;
    }

    const balance: number = accountResult.balance || 0;

    if (balance < FAUCET_CONFIG.MINIMUM_BALANCE) {
      const embed = new EmbedBuilder()
        .setAuthor({
          name: "Insufficient balance",
          iconURL: `https://cdn.discordapp.com/avatars/${interaction.user.id}/${interaction.user.avatar}`,
        })
        .setDescription(
          `❌ **You don't have enough balance to create a faucet.**\n\n` +
          `💰 **Your current balance:** ${balance} satoshis\n` +
          `🎁 **Minimum to gift:** 1 satoshi\n` +
          `📊 **Total minimum needed:** ${FAUCET_CONFIG.MINIMUM_BALANCE} satoshis\n\n` +
          `**You need at least ${FAUCET_CONFIG.MINIMUM_BALANCE - balance} more satoshis to create a faucet.**\n\n` +
          ` **Suggestions:**\n` +
          `• Use \`/recharge\` to add balance to your wallet\n` +
          `• Use \`/request\` to have others pay you\n` +
          `• Wait to have more balance before creating a faucet`
        );

      await interaction.editReply({
        embeds: [embed],
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setAuthor({
        name: "Create gift faucet",
        iconURL: `https://cdn.discordapp.com/avatars/${interaction.user.id}/${interaction.user.avatar}`,
      })
      .setDescription(
        `**With this command you can create a faucet to gift satoshis to the community. You must choose the total amount and the number of people who can claim.**\n\n` +
        `**Important information:**\n` +
        `• The amount you choose will be divided among the number of people\n` +
        `• **Formula:** \`Total amount / number of people = sats per person\`\n` +
        
        `**Example:** If you select 100 sats for 10 people, each person who claims will receive 10 sats.\n\n` +
        
        `**Your current balance:** ${balance} satoshis\n\n`);
      
    await interaction.editReply({
      embeds: [embed],
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId('create_faucet_modal')
            .setLabel('Create Faucet')
            .setStyle(1)
            .setEmoji('🎁')
        )
      ],
    });

  } catch (err: any) {
    log(
      `Error in /gift command executed by @${interaction.user.username} - Error code ${err.code} Message: ${err.message}`,
      "err"
    );

    await EphemeralMessageResponse(interaction, "❌ An unexpected error occurred");
  }
};

export { create, invoke };
