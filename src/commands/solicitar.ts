import {
  ActionRowBuilder,
  ButtonBuilder,
  EmbedBuilder,
  SlashCommandBuilder,
  ChatInputCommandInteraction,
} from "discord.js";
import { getAndValidateAccount } from "../handlers/accounts.js";
import {
  EphemeralMessageResponse,
  FollowUpEphemeralResponse,
} from "../utils/helperFunctions.js";
import { AuthorConfig } from "../utils/helperConfig.js";
import { formatter } from "../utils/helperFormatter.js";
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
    .setName("solicitar")
    .setDescription("Solicitar que te paguen una factura")
    .addNumberOption((opt) =>
      opt
        .setName("monto")
        .setDescription("La cantidad de satoshis a pagar en la factura")
        .setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("descripcion")
        .setDescription("La descripción de la factura")
        .setRequired(false)
    );

  return command.toJSON();
};


const invoke = async (interaction: ChatInputCommandInteraction) => {
  try {
    const user = interaction.user;
    if (!user) return;

    await interaction.deferReply();

    const montoOption = interaction.options.get('monto');
    const descripcionOption = interaction.options.get('descripcion');
    
    if (!montoOption || typeof montoOption.value !== 'number') {
      throw new Error("Monto is required and must be a number");
    }

    const amount: number = parseInt(montoOption.value.toString());
    const description: string = descripcionOption && typeof descripcionOption.value === 'string' 
      ? descripcionOption.value 
      : "";

    log(`@${user.username} ejecutó el comando /solicitar ${amount}`, "info");

    if (amount <= 0) {
      return FollowUpEphemeralResponse(
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
      description: description,
    });

    const embed = new EmbedBuilder().setAuthor(AuthorConfig).addFields([
      {
        name: "Solicitud de pago",
        value: `${invoiceDetails.invoice}`,
      },
      {
        name: "monto (sats)",
        value: `${formatter(0, 0).format(amount)}`,
      },
    ]);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents([
      new ButtonBuilder()
        .setCustomId("pay")
        .setLabel("Pagar factura")
        .setEmoji({ name: "💸" })
        .setStyle(2),
    ]);

    await interaction.editReply({
      embeds: [embed],
      components: [row],
    });
  } catch (err: any) {
    log(
      `Error en el comando /solicitar ejecutado por @${interaction.user.username} - Código de error ${err.code} Mensaje: ${err.message}`,
      "err"
    );
    EphemeralMessageResponse(interaction, "Ocurrió un error");
  }
};

export { create, invoke };
