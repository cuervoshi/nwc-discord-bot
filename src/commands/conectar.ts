import {
  EmbedBuilder,
  SlashCommandBuilder,
  ChatInputCommandInteraction,
} from "discord.js";
import { log } from "../handlers/log.js";
import { validateNWCURI, testNWCConnection } from "../utils/helperFunctions.js";
import { createOrUpdateAccount } from "../handlers/accounts.js";

interface ValidationResult {
  valid: boolean;
  error?: string;
}

interface ConnectionTestResult {
  valid: boolean;
  error?: string;
  balance?: number;
}

const create = () => {
  const command = new SlashCommandBuilder()
    .setName("conectar")
    .setDescription("Conecta tu billetera a través de Nostr Wallet Connect.")
    .addStringOption((opt) =>
      opt
        .setName("nwc_uri")
        .setDescription("String de conexión NWC")
        .setRequired(true)
    );

  return command.toJSON();
};

const invoke = async (interaction: ChatInputCommandInteraction) => {
  try {
    await interaction.deferReply({ ephemeral: true });
    
    const user = interaction.user;
    if (!user) throw new Error("No user interaction found");

    const nwcUriOption = interaction.options.get('nwc_uri');
    if (!nwcUriOption || typeof nwcUriOption.value !== 'string') {
      throw new Error("NWC URI is required and must be a string");
    }
    
    const NWC_URI: string = nwcUriOption.value;
    
    log(`@${user.username} intentó conectar con NWC`, "info");

    const formatValidation: ValidationResult = validateNWCURI(NWC_URI);
    if (!formatValidation.valid) {
      log(`@${user.username} proporcionó un NWC URI inválido: ${formatValidation.error}`, "err");
      return await interaction.editReply({
        content: `❌ **Error de validación:** ${formatValidation.error}\n\n**Formato esperado:**\n\`nostr+walletconnect://<pubkey>?relay=<relay_url>&secret=<secret>\``,
      });
    }

    log(`@${user.username} - NWC URI válido, probando conexión...`, "info");

    const connectionTest: ConnectionTestResult = await testNWCConnection(NWC_URI);
    if (!connectionTest.valid) {
      log(`@${user.username} - Error de conexión NWC: ${connectionTest.error}`, "err");
      return await interaction.editReply({
        content: `❌ **Error de conexión:** ${connectionTest.error}\n\nVerifica que:\n• El URI sea correcto\n• La billetera esté conectada\n• Los permisos sean válidos\n• El relay esté disponible`,
      });
    }

    const account = await createOrUpdateAccount(user.id, user.username, NWC_URI);
    if (!account) {
      log(`@${user.username} - Error al crear o actualizar la cuenta`, "err");

      return await interaction.editReply({
        content: "❌ Ocurrió un error inesperado al procesar la conexión",
      });
    }

    const embed = new EmbedBuilder()
      .setAuthor({
        name: "Conexión NWC exitosa",
        iconURL: `https://cdn.discordapp.com/avatars/${interaction.user.id}/${interaction.user.avatar}`,
      })
      .addFields([
        {
          name: "Estado",
          value: "Conexión establecida correctamente",
        },
        {
          name: "Balance",
          value: `**${connectionTest.balance} satoshis**`,
        },
      ]);

    log(`@${user.username} conectó exitosamente con NWC - Balance: ${connectionTest.balance} sats`, "info");

    await interaction.editReply({
      embeds: [embed],
    });

  } catch (err: any) {
    log(
      `Error en el comando /connect ejecutado por @${interaction.user.username} - Código de error ${err.code} Mensaje: ${err.message}`,
      "err"
    );

    await interaction.editReply({
      content: "❌ Ocurrió un error inesperado al procesar la conexión",
    });
  }
};

export { create, invoke };
