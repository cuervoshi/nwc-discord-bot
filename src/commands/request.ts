import { ActionRowBuilder, ButtonBuilder, EmbedBuilder, SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";
import { getAccount } from "../handlers/accounts.js";
import { EphemeralMessageResponse, FollowUpEphemeralResponse } from "../utils/helperFunctions.js";
import { AuthorConfig } from "../utils/helperConfig.js";
import { formatBalance } from "../utils/helperFormatter.js";
import { log } from "../handlers/log.js";
import { AccountResult } from "../types/index.js";
import { Nip47Transaction } from "@getalby/sdk";

const create = () => {
  const command = new SlashCommandBuilder()
    .setName("request")
    .setDescription("Request payment for an invoice")
    .addIntegerOption((opt) =>
      opt
        .setName("amount")
        .setDescription("The amount of satoshis to pay in the invoice")
        .setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("description")
        .setDescription("The description of the invoice")
        .setRequired(false)
    );

  return command.toJSON();
};


const invoke = async (interaction: ChatInputCommandInteraction) => {
  try {
    const user = interaction.user;
    if (!user) return;

    await interaction.deferReply();

    const amountOption = interaction.options.get('amount');
    const descriptionOption = interaction.options.get('description');
    
    if (!amountOption || typeof amountOption.value !== 'number') {
      throw new Error("Amount is required and must be a number");
    }

    const amount: number = parseInt(amountOption.value.toString());
    const description: string = descriptionOption && typeof descriptionOption.value === 'string' 
      ? descriptionOption.value 
      : "";

    log(`@${user.username} executed the /request command ${amount}`, "info");

    if (amount <= 0) {
      return FollowUpEphemeralResponse(
        interaction,
        "Negative balances are not allowed"
      );
    }

    const wallet: AccountResult = await getAccount(interaction, user.id);
    if (!wallet.success || !wallet.nwcClient) {
      return EphemeralMessageResponse(interaction, wallet.message || "Error getting account");
    }

    const invoiceDetails: Nip47Transaction = await wallet.nwcClient.makeInvoice({
      amount: amount * 1000,
      description: description,
    });

    const embed = new EmbedBuilder().setAuthor(AuthorConfig).addFields([
      {
        name: "Payment request",
        value: `${invoiceDetails.invoice}`,
      },
      {
        name: "amount (sats)",
        value: `${formatBalance(amount)}`,
      },
    ]);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents([
      new ButtonBuilder()
        .setCustomId("pay")
        .setLabel("Pay invoice")
        .setEmoji({ name: "💸" })
        .setStyle(2),
    ]);

    await interaction.editReply({
      embeds: [embed],
      components: [row],
    });
  } catch (err: any) {
    log(
      `Error in /request command executed by @${interaction.user.username} - Error code ${err.code} Message: ${err.message}`,
      "err"
    );
    EphemeralMessageResponse(interaction, "An error occurred");
  }
};

export { create, invoke };
