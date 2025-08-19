import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonInteraction } from "discord.js";
import { log } from "../../handlers/log.js";

const customId = "create_faucet_modal";

const invoke = async (interaction: ButtonInteraction): Promise<void> => {
  try {
    log(`@${interaction.user.username} abriendo modal para crear faucet`, "info");

    const modal = new ModalBuilder()
      .setCustomId('faucet_modal')
      .setTitle('Crear Faucet de Regalo');

    const amountInput = new TextInputBuilder()
      .setCustomId('faucet_amount')
      .setLabel('Monto total a regalar (en satoshis)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Ej: 100')
      .setMinLength(1)
      .setMaxLength(6)
      .setRequired(true);

    const usersInput = new TextInputBuilder()
      .setCustomId('faucet_users')
      .setLabel('Cantidad de personas que pueden reclamar')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Ej: 10')
      .setMinLength(1)
      .setMaxLength(3)
      .setRequired(true);

    const amountRow = new ActionRowBuilder<TextInputBuilder>().addComponents(amountInput);
    const usersRow = new ActionRowBuilder<TextInputBuilder>().addComponents(usersInput);

    modal.addComponents(amountRow, usersRow);

    await interaction.showModal(modal);

  } catch (err: any) {
    log(`Error abriendo modal para @${interaction.user.username}: ${err.message}`, "err");
    await interaction.reply({
      content: "❌ Ocurrió un error al abrir el formulario",
      ephemeral: true
    });
  }
};

export { customId, invoke };
