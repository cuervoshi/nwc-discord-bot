import {
  AttachmentBuilder,
  EmbedBuilder,
  SlashCommandBuilder,
  ChatInputCommandInteraction,
} from "discord.js";
import { getAndValidateAccount } from "../handlers/accounts.js";
import {
  EphemeralMessageResponse,
} from "../utils/helperFunctions.js";
import QRCode from "qrcode";
import { log } from "../handlers/log.js";

interface InvoiceDetails {
  invoice: string;
}

interface AccountResult {
  success: boolean;
  message?: string;
  nwcClient?: {
    makeInvoice: (params: { amount: number; description: string }) => Promise<InvoiceDetails>;
  };
}

const create = () => {
  const command = new SlashCommandBuilder()
    .setName("recargar")
    .setDescription("Recarga tu cuenta de lightning network con una factura")
    .addNumberOption((opt) =>
      opt
        .setName("monto")
        .setDescription("La cantidad de satoshis a pagar en la factura")
        .setRequired(true)
    );

  return command.toJSON();
};

const invoke = async (interaction: ChatInputCommandInteraction) => {
  try {
    const user = interaction.user;
    if (!user) return;

    await interaction.deferReply({ ephemeral: true });

    const montoOption = interaction.options.get('monto');
    if (!montoOption || typeof montoOption.value !== 'number') {
      throw new Error("Monto is required and must be a number");
    }

    const amount: number = parseInt(montoOption.value.toString());

    log(`@${user.username} ejecutó /recargar ${amount}`, "info");

    if (amount <= 0) {
      return EphemeralMessageResponse(
        interaction,
        "No se permiten saldos negativos"
      );
    }

    const wallet: AccountResult = await getAndValidateAccount(interaction, user.id);
    if (!wallet.success || !wallet.nwcClient) {
      return EphemeralMessageResponse(interaction, wallet.message || "Error al obtener la cuenta");
    }

    const invoiceDetails: InvoiceDetails = await wallet.nwcClient.makeInvoice({ 
      amount: amount * 1000, 
      description: `Recargar ${amount} sats a la billetera de discord del usuario ${interaction.user.username}` 
    });

    const qrData: string = await QRCode.toDataURL(invoiceDetails.invoice);
    const buffer: Buffer = Buffer.from(qrData.split(',')[1], 'base64');
    const file: AttachmentBuilder = new AttachmentBuilder(buffer, { name: 'image.png' });
    
    const embed = new EmbedBuilder()
      .setImage('attachment://image.png')
      .addFields([
        {
          name: "Solicitud de pago",
          value: `${invoiceDetails.invoice}`,
        },
        {
          name: "monto",
          value: `${amount}`,
        },
      ]);

    log(
      `@${user.username} ejecutó /recargar ${amount} y se le creo un invoice: ${invoiceDetails.invoice}`,
      "info"
    );

    return interaction.editReply({
      embeds: [embed],
      files: [file],
    });
  } catch (err: any) {
    log(
      `Error en el comando /recargar ejecutado por @${interaction.user.username} - Código de error ${err.code} Mensaje: ${err.message}`,
      "err"
    );
    EphemeralMessageResponse(interaction, "Ocurrió un error");
  }
};

export { create, invoke };
