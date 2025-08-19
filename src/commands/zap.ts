import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";
import { updateUserRank } from "../handlers/donate.js";
import { log } from "../handlers/log.js";
import { EphemeralMessageResponse } from "../utils/helperFunctions.js";
import { zap } from "../handlers/zap.js";

interface ZapResult {
  success: boolean;
  message: string;
}


const create = () => {
  const command = new SlashCommandBuilder()
    .setName("zap")
    .setDescription("Regala sats a un usuario en discord")
    .addUserOption((opt) =>
      opt.setName("user").setDescription("Usuario a zappear").setRequired(true)
    )
    .addNumberOption((opt) =>
      opt
        .setName("monto")
        .setDescription("La cantidad de satoshis a transferir")
        .setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("message")
        .setDescription("Un mensaje de la transferencia")
        .setRequired(false)
    );

  return command.toJSON();
};


const invoke = async (interaction: ChatInputCommandInteraction) => {
  try {
    const user = interaction.user;
    if (!user) return;

    await interaction.deferReply({ ephemeral: true });

    const receiverOption = interaction.options.get('user');
    const montoOption = interaction.options.get('monto');
    const messageOption = interaction.options.get('message');
    
    if (!receiverOption || !receiverOption.user) {
      throw new Error("User option is required");
    }
    
    if (!montoOption || typeof montoOption.value !== 'number') {
      throw new Error("Monto is required and must be a number");
    }

    const receiver = receiverOption;
    const amount: number = parseInt(montoOption.value.toString());

    log(
      `@${user.username} ejecutó /zap ${receiver.user.username} ${amount}`,
      "info"
    );

    const receiverData = await interaction.guild!.members.fetch(
      receiver.user.id
    );

    const zapMessage: string = messageOption && typeof messageOption.value === 'string'
      ? messageOption.value
      : `${user.username} te envío ${amount} sats a través de discord`;

    const onSuccess = async () => {
      try {
        await updateUserRank(interaction.user.id, "comunidad", amount);

        log(
          `@${user.username} pago la factura del zap hacia @${receiver.user.username}`,
          "info"
        );

        await interaction.deleteReply();

        if (interaction.channel && interaction.channel.isTextBased()) {
          await interaction.channel.send({
            content: `${interaction.user.toString()} envió ${amount} satoshis a ${receiverData.toString()}`,
          });
        }
      } catch (err: any) {
        console.log(err);
        EphemeralMessageResponse(interaction, "Ocurrió un error");
      }
    };

    const onError = () => {
      log(
        `@${user.username} tuvo un error al realizar el pago del zap hacia @${receiver.user.username}`,
        "err"
      );

      EphemeralMessageResponse(interaction, "Ocurrió un error");
    };

    const result: ZapResult = await zap(
      interaction,
      user,
      receiverData.user,
      amount,
      onSuccess,
      onError,
      zapMessage
    );

    if (!result.success) {
      return EphemeralMessageResponse(interaction, result.message);
    } else {
      await onSuccess();
    }
  } catch (err: any) {
    log(
      `Error en el comando /zap ejecutado por @${interaction.user.username} - Código de error ${err.code} Mensaje: ${err.message}`,
      "err"
    );

    EphemeralMessageResponse(interaction, "Ocurrió un error");
  }
};

export { create, invoke };
