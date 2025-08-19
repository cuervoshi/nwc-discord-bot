import { ActionRowBuilder, ButtonBuilder, ButtonInteraction } from "discord.js";
import { getAndValidateAccount } from "../../handlers/accounts.js";
import { log } from "../../handlers/log.js";
import { FollowUpEphemeralResponse } from "../../utils/helperFunctions.js";

interface AccountResult {
  success: boolean;
  message?: string;
  balance?: number;
  nwcClient?: {
    payInvoice: (params: { invoice: string }) => Promise<any>;
  };
}

const customId = "pay";

const invoke = async (interaction: ButtonInteraction): Promise<void> => {
  try {
    await interaction.deferReply({ ephemeral: true });

    const payUrl = interaction.message.embeds[0].fields.find(
      (field) => field.name === "Solicitud de pago"
    );

    const amountOnSats = interaction.message.embeds[0].fields.find(
      (field) => field.name === "monto (sats)"
    );

    if (payUrl && amountOnSats) {
      const userWallet: AccountResult = await getAndValidateAccount(interaction, interaction.user.id);
      const satsBalance: number = userWallet.balance || 0;

      if (!userWallet.success || !userWallet.nwcClient) {
        throw new Error("No se pudo obtener la cuenta del usuario");
      }

      if (satsBalance < parseInt(amountOnSats.value)) {
        return FollowUpEphemeralResponse(
          interaction,
          `No tienes balance suficiente para pagar esta factura. \nTu balance: ${satsBalance} - Requerido: ${amountOnSats.value}`
        );
      } else {
        const response = await userWallet.nwcClient.payInvoice({
          invoice: payUrl.value,
        });

        if (!response) throw new Error("Error al pagar la factura");

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents([
          new ButtonBuilder()
            .setCustomId("pay")
            .setLabel(`Pagada por @${interaction.user.username}`)
            .setEmoji({ name: `💸` })
            .setStyle(2)
            .setDisabled(true),
        ]);

        await interaction.message.edit({ components: [row] });

        await interaction.editReply({
          content: "Interacción con pago de factura completada.",
        });
      }
    }
  } catch (err: any) {
    log(
      `Error cuando @${interaction.user.username} intentó pagar una factura de /solicitar - Código de error ${err.code} Mensaje: ${err.message}`,
      "err"
    );
    return FollowUpEphemeralResponse(interaction, "Ocurrió un error");
  }
};

export { invoke, customId };
