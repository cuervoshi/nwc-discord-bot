import {
  SlashCommandBuilder,
  EmbedBuilder,
  ChatInputCommandInteraction,
  AttachmentBuilder,
} from "discord.js";
import { getAccount } from "../handlers/accounts.js";
import {
  EphemeralMessageResponse,
} from "../utils/helperFunctions.js";
import QRCode from "qrcode";
import { log } from "../handlers/log.js";
import { AccountResult } from "../types/index.js";
import { Nip47Transaction } from "@getalby/sdk";

const create = () => {
  const command = new SlashCommandBuilder()
    .setName("recharge")
    .setDescription("Recharge your lightning network account with an invoice")
    .addNumberOption((opt) =>
      opt
        .setName("amount")
        .setDescription("The amount of satoshis to pay in the invoice")
        .setRequired(true)
    );

  return command.toJSON();
};

const invoke = async (interaction: ChatInputCommandInteraction) => {
  try {
    const user = interaction.user;
    if (!user) return;

    await interaction.deferReply({ ephemeral: true });

    const amountOption = interaction.options.get('amount');
    if (!amountOption || typeof amountOption.value !== 'number') {
      throw new Error("Amount is required and must be a number");
    }

    const amount: number = parseInt(amountOption.value.toString());

    log(`@${user.username} executed /recharge ${amount}`, "info");

    if (amount <= 0) {
      return EphemeralMessageResponse(
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
      description: `Recharge ${amount} sats to the discord wallet of user ${interaction.user.username}` 
    });

    const qrData: string = await QRCode.toDataURL(invoiceDetails.invoice);
    const buffer: Buffer = Buffer.from(qrData.split(',')[1], 'base64');
    const file: AttachmentBuilder = new AttachmentBuilder(buffer, { name: 'image.png' });
    
    const embed = new EmbedBuilder()
      .setImage('attachment://image.png')
      .addFields([
        {
          name: "Payment request",
          value: `${invoiceDetails.invoice}`,
        },
        {
          name: "amount",
          value: `${amount}`,
        },
      ]);

    log(
      `@${user.username} executed /recharge ${amount} and an invoice was created: ${invoiceDetails.invoice}`,
      "info"
    );

    return interaction.editReply({
      embeds: [embed],
      files: [file],
    });
  } catch (err: any) {
    log(
      `Error in /recharge command executed by @${interaction.user.username} - Error code ${err.code} Message: ${err.message}`,
      "err"
    );
    EphemeralMessageResponse(interaction, "An error occurred");
  }
};

export { create, invoke };