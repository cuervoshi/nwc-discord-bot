import { SlashCommandBuilder, EmbedBuilder, ChatInputCommandInteraction } from "discord.js";
import { getAccount } from "../handlers/accounts.js";
import {
  EphemeralMessageResponse,
  validateAndDecodeBOLT11,
  validateAmountAndBalance,
  isBOLT11Expired,
  handleInvoicePayment
} from "../utils/helperFunctions.js";
import { log } from "../handlers/log.js";
import { BOLT11ValidationResult, BalanceValidationResult, AccountResult } from "../types/index.js";

const create = () => {
  const command = new SlashCommandBuilder()
    .setName("pay")
    .setDescription("Pay a lightning network invoice")
    .addStringOption((opt) =>
      opt
        .setName("bolt11")
        .setDescription("BOLT11 of the invoice you want to pay")
        .setRequired(true)
    );

  return command.toJSON();
};

const invoke = async (interaction: ChatInputCommandInteraction) => {
  try {
    const user = interaction.user;
    if (!user) return;

    await interaction.deferReply({ ephemeral: true });

    const bolt11Option = interaction.options.get('bolt11');
    if (!bolt11Option || typeof bolt11Option.value !== 'string') {
      throw new Error("BOLT11 is required and must be a string");
    }

    const paymentRequest: string = bolt11Option.value;

    log(`@${user.username} executed /pay ${paymentRequest}`, "info");

    const bolt11Validation: BOLT11ValidationResult = validateAndDecodeBOLT11(paymentRequest);
    if (!bolt11Validation.valid) {
      log(`@${user.username} - Invalid BOLT11: ${bolt11Validation.error}`, "err");
      await EphemeralMessageResponse(interaction, `❌ **BOLT11 Error:** ${bolt11Validation.error}`);
      return;
    }

    const { amount, decoded } = bolt11Validation;

    if (!decoded || isBOLT11Expired(decoded)) {
      log(`@${user.username} - Expired BOLT11`, "err");
      await EphemeralMessageResponse(interaction, "❌ **The invoice has expired.**");
      return;
    }

    const accountResult: AccountResult = await getAccount(interaction, user.id);
    if (!accountResult.success) {
      await EphemeralMessageResponse(interaction, accountResult.message || "Unknown error");
      return;
    }

    if (!accountResult.nwcClient || accountResult.balance === undefined) {
      throw new Error("Could not get NWC client or balance");
    }

    const { nwcClient, balance } = accountResult;

    const balanceValidation: BalanceValidationResult = validateAmountAndBalance(amount || 0, balance);
    if (!balanceValidation.status) {
      log(`@${user.username} - Insufficient balance: ${balanceValidation.content}`, "err");
      await EphemeralMessageResponse(interaction, balanceValidation.content);
      return;
    }

    try {
      const paymentResult = await handleInvoicePayment(
        nwcClient,
        paymentRequest,
        accountResult.isServiceAccount || false,
        user.username
      );

      if (!paymentResult.success) {
        throw new Error(paymentResult.error || "Error paying invoice");
      }

      log(`@${user.username} paid successfully: ${JSON.stringify(paymentResult, null, 2)}`, "info");

      const successEmbed = new EmbedBuilder()
        .setAuthor({
          name: "Payment successful",
          iconURL: `https://cdn.discordapp.com/avatars/${interaction.user.id}/${interaction.user.avatar}`,
        })
        .addFields([
          {
            name: 'Status',
            value: 'Payment completed successfully',
          },
          {
            name: 'Amount paid',
            value: `**${amount} satoshis**`,
          }
        ]);

      await interaction.editReply({
        content: null,
        embeds: [successEmbed],
      });

    } catch (paymentError: any) {
      log(`@${user.username} - Error paying: ${paymentError.message}`, "err");
      await EphemeralMessageResponse(interaction, `❌ **Error making payment:** ${paymentError.message}`);
    }

  } catch (err: any) {
    log(
      `Error in /pay command executed by @${interaction.user.username} - Error code ${err.code} Message: ${err.message}`,
      "err"
    );
    
    await EphemeralMessageResponse(interaction, "❌ **An unexpected error occurred.**\n\n**Please ensure you have allowed at least 10 sats for routing fees in your NWC connection, as this is often the cause of payment failures.**");
  }
};

export { create, invoke };
