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
    .setName("enviar")
    .setDescription("Retira satoshis a una cuenta externa a discord")
    .addStringOption((opt) =>
      opt
        .setName("address")
        .setDescription("Dirección de lightning network")
        .setRequired(true)
    )
    .addNumberOption((opt) =>
      opt
        .setName("monto")
        .setDescription("El monto en satoshis que deseas enviar")
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
    const montoOption = interaction.options.get('monto');
    
    if (!addressOption || typeof addressOption.value !== 'string') {
      throw new Error("Address is required and must be a string");
    }
    
    if (!montoOption || typeof montoOption.value !== 'number') {
      throw new Error("Monto is required and must be a number");
    }

    const address: string = addressOption.value;
    const amount: number = montoOption.value;

    log(`@${user.username} ejecutó /retirar ${address} ${amount}`, "info");

    const wallet = await getAndValidateAccount(interaction, user.id);
    if (!wallet.success) {
      return EphemeralMessageResponse(interaction, wallet.message || "Error al obtener la cuenta");
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
        `@${interaction.user.username} está pagando la factura ${invoice.invoice}`,
        "info"
      );

      const response = await wallet.nwcClient.payInvoice({
        invoice: invoice.invoice,
      });
      
      if (!response) {
        throw new Error("Error al pagar la factura");
      }

      log(
        `@${interaction.user.username} pagó la factura ${invoice.invoice}`,
        "info"
      );

      await interaction.editReply({
        content: `Enviaste ${amount} satoshis a ${address} desde tu billetera`,
      });
    }
  } catch (err: any) {
    log(
      `Error en el comando /retirar ejecutado por @${interaction.user.username} - Código de error ${err.code} Mensaje: ${err.message}`,
      "err"
    );

    EphemeralMessageResponse(
      interaction,
      "Ocurrió un error. Los parámetros de este comando son <ln url o address> y <monto>. Si deseas pagar una factura utiliza el comando /pagar"
    );
  }
};

export { create, invoke };
