import {
  ActionRowBuilder,
  EmbedBuilder,
  SlashCommandBuilder,
  ButtonBuilder,
  ChatInputCommandInteraction,
} from "discord.js";
import { getAndValidateAccount } from "../handlers/accounts.js";
import {
  EphemeralMessageResponse,
} from "../utils/helperFunctions.js";
import { FAUCET_CONFIG } from "../utils/faucetConfig.js";
import { log } from "../handlers/log.js";

interface AccountResult {
  success: boolean;
  message?: string;
  balance?: number;
}

const create = () => {
  const command = new SlashCommandBuilder()
    .setName("regalar")
    .setDescription("Crea un faucet para regalar satoshis a la comunidad");

  return command.toJSON();
};

const invoke = async (interaction: ChatInputCommandInteraction) => {
  try {
    const user = interaction.user;
    if (!user) return;

    await interaction.deferReply({ ephemeral: true });

    log(`@${user.username} ejecutó /regalar`, "info");

    const accountResult: AccountResult = await getAndValidateAccount(interaction, user.id);
    if (!accountResult.success) {
      await EphemeralMessageResponse(interaction, accountResult.message || "Error desconocido");
      return;
    }

    const balance: number = accountResult.balance || 0;

    if (balance < FAUCET_CONFIG.MINIMUM_BALANCE) {
      const embed = new EmbedBuilder()
        .setAuthor({
          name: "Saldo insuficiente",
          iconURL: `https://cdn.discordapp.com/avatars/${interaction.user.id}/${interaction.user.avatar}`,
        })
        .setDescription(
          `❌ **No tienes saldo suficiente para crear un faucet.**\n\n` +
          `💰 **Tu saldo actual:** ${balance} satoshis\n` +
          `🎁 **Mínimo para regalar:** 1 satoshi\n` +
          `📊 **Total mínimo necesario:** ${FAUCET_CONFIG.MINIMUM_BALANCE} satoshis\n\n` +
          `**Necesitas al menos ${FAUCET_CONFIG.MINIMUM_BALANCE - balance} satoshis más para crear un faucet.**\n\n` +
          ` **Sugerencias:**\n` +
          `• Usa \`/recargar\` para agregar saldo a tu billetera\n` +
          `• Usa \`/solicitar\` para que otros te paguen\n` +
          `• Espera a tener más saldo antes de crear un faucet`
        );

      await interaction.editReply({
        embeds: [embed],
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setAuthor({
        name: "Crear faucet de regalo",
        iconURL: `https://cdn.discordapp.com/avatars/${interaction.user.id}/${interaction.user.avatar}`,
      })
      .setDescription(
        `**Con este comando puedes crear un faucet para regalar satoshis a la comunidad. Debes elegir el monto total y la cantidad de personas que pueden reclamar.**\n\n` +
        `**Información importante:**\n` +
        `• El monto que elijas se dividirá entre la cantidad de personas\n` +
        `• **Fórmula:** \`Monto total / cantidad de personas = sats por persona\`\n` +
        
        `**Ejemplo:** Si seleccionas 100 sats para 10 personas, cada persona que reclame recibirá 10 sats.\n\n` +
        
        `**Tu saldo actual:** ${balance} satoshis\n\n`);
      
    await interaction.editReply({
      embeds: [embed],
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId('create_faucet_modal')
            .setLabel('Crear Faucet')
            .setStyle(1)
            .setEmoji('🎁')
        )
      ],
    });

  } catch (err: any) {
    log(
      `Error en el comando /regalar ejecutado por @${interaction.user.username} - Código de error ${err.code} Mensaje: ${err.message}`,
      "err"
    );

    await EphemeralMessageResponse(interaction, "❌ Ocurrió un error inesperado");
  }
};

export { create, invoke };
