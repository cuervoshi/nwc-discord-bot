import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";
import { getAndValidateAccount } from "../handlers/accounts.js";
import {
  EphemeralMessageResponse,
  validateAmountAndBalance,
} from "../utils/helperFunctions.js";
import lnurl from "lnurl-pay";
import { log } from "../handlers/log.js";
import { Satoshis } from "lnurl-pay/dist/types/types.js";

interface ValidationResult {
  status: boolean;
  content: string;
}

interface InvoiceResult {
  invoice: string;
}

const create = () => {
  const command = new SlashCommandBuilder()
    .setName("send")
    .setDescription("Withdraw satoshis to an external account outside discord")
    .addStringOption((opt) =>
      opt
        .setName("address")
        .setDescription("Lightning network address")
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

    const wallet = await getAndValidateAccount(interaction, user.id);
    if (!wallet.success) {
      return EphemeralMessageResponse(interaction, wallet.message || "Error getting account");
    }

    const balanceInSats: number = wallet.balance || 0;

    const isValidAmount: ValidationResult = validateAmountAndBalance(amount, balanceInSats);

    if (!isValidAmount.status) {
      return EphemeralMessageResponse(interaction, isValidAmount.content);
    }

    const invoice: InvoiceResult = await lnurl.requestInvoice({
      lnUrlOrAddress: address,
      tokens: amount as Satoshis,
    });

    if (invoice && invoice.invoice) {
      log(
        `@${interaction.user.username} is paying the invoice ${invoice.invoice}`,
        "info"
      );

      const response = await wallet.nwcClient.payInvoice({
        invoice: invoice.invoice,
      });
      
      if (!response) {
        throw new Error("Error paying the invoice");
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
      "An error occurred. The parameters for this command are <ln url or address> and <amount>. If you want to pay an invoice use the /pay command"
    );
  }
};

export { create, invoke };
