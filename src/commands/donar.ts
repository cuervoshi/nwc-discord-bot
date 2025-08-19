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
    .setName("donar")
    .setDescription("Realiza donaciones al pozo de la crypta.")
    .addNumberOption((opt) =>
      opt
        .setName("monto")
        .setDescription("La cantidad de satoshis a donar")
        .setRequired(true)
    );

  return command.toJSON();
};

const invoke = async (interaction: ChatInputCommandInteraction) => {
  try {
    const user = interaction.user;
    if (!user) return;

    await interaction.deferReply();

    const montoOption = interaction.options.get('monto');
    if (!montoOption || typeof montoOption.value !== 'number') {
      throw new Error("Monto is required and must be a number");
    }
    
    const amount: number = montoOption.value;

    log(`@${user.username} ejecutó /donar ${amount}`, "info");

    const wallet = await getAndValidateAccount(interaction, user.id);
    if (!wallet.success) {
      return EphemeralMessageResponse(interaction, wallet.message || "Error al obtener la cuenta");
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
        throw new Error("Error al pagar la factura");
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
            name: `Donación a ${process.env.POOL_ADDRESS}`,
            value: `${interaction.user.toString()} ha donado ${formatter(
              0,
              2
            ).format(amount)} satoshis al pozo!`,
          },
          {
            name: "Total donado",
            value:
              updatedRank && updatedRank.amount
                ? `${formatter(0, 0).format(updatedRank.amount)}`
                : "0",
          }
        );

      log(`@${user.username} donó ${amount} al pozo`, "info");

      return interaction.editReply({ embeds: [embed] });
    }
  } catch (err: any) {
    log(
      `Error en el comando /donar ejecutado por @${interaction.user.username} - Código de error ${err.code} Mensaje: ${err.message}`,
      "err"
    );

    EphemeralMessageResponse(interaction, "Ocurrió un error");
  }
};

export { create, invoke };
