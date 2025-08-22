import { 
  EmbedBuilder, 
  SlashCommandBuilder, 
  ChatInputCommandInteraction 
} from "discord.js";
import { getAndValidateAccount } from "../handlers/accounts.js";
import {
  EphemeralMessageResponse,
  FollowUpEphemeralResponse,
  validateAmountAndBalance,
} from "../utils/helperFunctions.js";
import { updateUserRank } from "../handlers/donate.js";
import lnurl from "lnurl-pay";
import { formatter } from "../utils/helperFormatter.js";
import { log } from "../handlers/log.js";
import { Satoshis } from "lnurl-pay/dist/types/types.js";

interface ValidationResult {
  status: boolean;
  content: string;
}

interface InvoiceResult {
  invoice: string;
}

interface RankResult {
  amount?: number;
}

const create = () => {
  const command = new SlashCommandBuilder()
    .setName("donate")
    .setDescription("Make donations to the crypta pool.")
    .addNumberOption((opt) =>
      opt
        .setName("amount")
        .setDescription("The amount of satoshis to donate")
        .setRequired(true)
    );

  return command.toJSON();
};

const invoke = async (interaction: ChatInputCommandInteraction) => {
  try {
    const user = interaction.user;
    if (!user) return;

    await interaction.deferReply();

    const amountOption = interaction.options.get('amount');
    if (!amountOption || typeof amountOption.value !== 'number') {
      throw new Error("Amount is required and must be a number");
    }
    
    const amount: number = amountOption.value;

    log(`@${user.username} executed /donate ${amount}`, "info");

    const wallet = await getAndValidateAccount(interaction, user.id);
    if (!wallet.success) {
      return EphemeralMessageResponse(interaction, wallet.message || "Error getting account");
    }

    const senderBalance: number = wallet.balance || 0;

    const isValidAmount: ValidationResult = validateAmountAndBalance(
      amount,
      senderBalance
    );

    if (!isValidAmount.status) {
      return FollowUpEphemeralResponse(interaction, isValidAmount.content);
    }

    const invoice: InvoiceResult = await lnurl.requestInvoice({
      lnUrlOrAddress: process.env.POOL_ADDRESS || "",
      tokens: amount as Satoshis,
    });

    if (invoice && invoice.invoice) {
      const response = await wallet.nwcClient.payInvoice({
        invoice: invoice.invoice,
      });

      if (!response) {
        throw new Error("Error paying invoice");
      }

      const updatedRank: RankResult = await updateUserRank(
        interaction.user.id,
        "pozo",
        amount
      );

      const embed = new EmbedBuilder()
        .setColor("#0099ff")
        .setAuthor({
          name: `${interaction.user.globalName}`,
          iconURL: `https://cdn.discordapp.com/avatars/${interaction.user.id}/${interaction.user.avatar}`,
        })
        .addFields(
          {
            name: `Donation to ${process.env.POOL_ADDRESS}`,
            value: `${interaction.user.toString()} has donated ${formatter(
              0,
              2
            ).format(amount)} satoshis to the pool!`,
          },
          {
            name: "Total donated",
            value:
              updatedRank && updatedRank.amount
                ? `${formatter(0, 0).format(updatedRank.amount)}`
                : "0",
          }
        );

      log(`@${user.username} donated ${amount} to the pool`, "info");

      return interaction.editReply({ embeds: [embed] });
    }
  } catch (err: any) {
    log(
      `Error in /donate command executed by @${interaction.user.username} - Error code ${err.code} Message: ${err.message}`,
      "err"
    );

    EphemeralMessageResponse(interaction, "An error occurred");
  }
};

export { create, invoke };
