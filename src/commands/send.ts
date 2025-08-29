import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";
import { getAccount } from "../handlers/accounts.js";
import {
  EphemeralMessageResponse,
  validateAmountAndBalance
} from "../utils/helperFunctions.js";
import { handleInvoicePayment } from "../handlers/payments.js";
import lnurl from "lnurl-pay";
import { log } from "../handlers/log.js";
import { LnUrlRequestInvoiceResponse, Satoshis } from "lnurl-pay/dist/types/types.js";
import { BalanceValidationResult } from "../types/index.js";

const create = () => {
  const command = new SlashCommandBuilder()
    .setName("send")
    .setDescription("Withdraw satoshis to an external account outside discord")
    .addStringOption((opt) =>
      opt
        .setName("address")
        .setDescription("Lightning network address (LUD16) or LNURL")
        .setRequired(true)
    )
    .addNumberOption((opt) =>
      opt
        .setName("amount")
        .setDescription("The amount in satoshis you want to send")
        .setRequired(true)
    );

  return command.toJSON();
};

const invoke = async (interaction: ChatInputCommandInteraction) => {
  try {
    const user = interaction.user;
    if (!user) return;

    await interaction.deferReply({ ephemeral: true });

    const addressOption = interaction.options.get('address');
    const amountOption = interaction.options.get('amount');
    
    if (!addressOption || typeof addressOption.value !== 'string') {
      throw new Error("Address is required and must be a string");
    }
    
    if (!amountOption || typeof amountOption.value !== 'number') {
      throw new Error("Amount is required and must be a number");
    }

    const address: string = addressOption.value;
    const amount: number = amountOption.value;

    log(`@${user.username} executed /send ${address} ${amount}`, "info");

    const wallet = await getAccount(interaction, user.id);
    if (!wallet.success) {
      return EphemeralMessageResponse(interaction, wallet.message || "Error getting account");
    }

    const balanceInSats: number = wallet.balance || 0;
    const isValidAmount: BalanceValidationResult = validateAmountAndBalance(amount, balanceInSats, wallet.isServiceAccount || false);

    if (!isValidAmount.status) {
      return EphemeralMessageResponse(interaction, isValidAmount.content);
    }

    const invoice: LnUrlRequestInvoiceResponse = await lnurl.requestInvoice({
      lnUrlOrAddress: address,
      tokens: amount as Satoshis,
    });

    if (invoice && invoice.invoice) {
      log(
        `@${interaction.user.username} is paying the invoice ${invoice.invoice}`,
        "info"
      );

      const paymentResult = await handleInvoicePayment(
        wallet.nwcClient,
        invoice.invoice,
        wallet.isServiceAccount || false,
        user.username
      );
      
      if (!paymentResult.success) {
        throw new Error(paymentResult.error || "Error paying the invoice");
      }

      log(
        `@${interaction.user.username} paid the invoice ${invoice.invoice}`,
        "info"
      );

      await interaction.editReply({
        content: `You sent ${amount} satoshis to ${address} from your wallet`,
      });
    }
  } catch (err: any) {
    log(
      `Error in /send command executed by @${interaction.user.username} - Error code ${err.code} Message: ${err.message}`,
      "err"
    );

    EphemeralMessageResponse(
      interaction,
      "❌ **An error occurred.**\n\n**Please ensure you have allowed at least 10 sats for routing fees in your NWC connection, as this is often the cause of payment failures.**\n\nThe parameters for this command are <ln url or address> and <amount>. If you want to pay an invoice use the `/pay` command."
    );
  }
};

export { create, invoke };
