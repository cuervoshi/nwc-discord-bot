import { ActionRowBuilder, ButtonBuilder, ButtonInteraction } from "discord.js";
import { getAccount } from "../../handlers/accounts.js";
import { log } from "../../handlers/log.js";
import { FollowUpEphemeralResponse, handleInvoicePayment } from "../../utils/helperFunctions.js";
import { AccountResult } from "../../types/index.js";

const customId = "pay";

const invoke = async (interaction: ButtonInteraction): Promise<void> => {
  try {
    await interaction.deferReply({ ephemeral: true });

    const payUrl = interaction.message.embeds[0].fields.find(
      (field) => field.name === "Payment request"
    );

    const amountOnSats = interaction.message.embeds[0].fields.find(
      (field) => field.name === "amount (sats)"
    );

    if (payUrl && amountOnSats) {
      const userWallet: AccountResult = await getAccount(interaction, interaction.user.id);
      const satsBalance: number = userWallet.balance || 0;

      if (!userWallet.success || !userWallet.nwcClient) {
        throw new Error("Could not get user account");
      }

      if (satsBalance < parseInt(amountOnSats.value)) {
        return FollowUpEphemeralResponse(
          interaction,
          `You don't have enough balance to pay this invoice. \nYour balance: ${satsBalance} - Required: ${amountOnSats.value}`
        );
      } else {
        const paymentResult = await handleInvoicePayment(
          userWallet.nwcClient,
          payUrl.value,
          userWallet.isServiceAccount || false,
          interaction.user.username
        );

        if (!paymentResult.success) {
          throw new Error(paymentResult.error || "Error paying invoice");
        }

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents([
          new ButtonBuilder()
            .setCustomId("pay")
            .setLabel(`Paid by @${interaction.user.username}`)
            .setEmoji({ name: `💸` })
            .setStyle(2)
            .setDisabled(true),
        ]);

        await interaction.message.edit({ components: [row] });

        await interaction.editReply({
          content: "Invoice payment interaction completed.",
        });
      }
    }
  } catch (err: any) {
    log(
      `Error when @${interaction.user.username} tried to pay an invoice from /request - Error code ${err.code} Message: ${err.message}`,
      "err"
    );
    return FollowUpEphemeralResponse(interaction, "❌ **An error occurred.**\n\n**Please ensure you have allowed at least 10 sats for routing fees in your NWC connection, as this is often the cause of payment failures.**");
  }
};

export { invoke, customId };
