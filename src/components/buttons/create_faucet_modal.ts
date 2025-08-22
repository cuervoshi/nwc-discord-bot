import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonInteraction } from "discord.js";
import { log } from "../../handlers/log.js";

const customId = "create_faucet_modal";

const invoke = async (interaction: ButtonInteraction): Promise<void> => {
  try {
    log(`@${interaction.user.username} opening modal to create faucet`, "info");

    const modal = new ModalBuilder()
      .setCustomId('faucet_modal')
      .setTitle('Create Gift Faucet');

    const amountInput = new TextInputBuilder()
      .setCustomId('faucet_amount')
      .setLabel('Total amount to gift (in satoshis)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Ex: 100')
      .setMinLength(1)
      .setMaxLength(6)
      .setRequired(true);

    const usersInput = new TextInputBuilder()
      .setCustomId('faucet_users')
      .setLabel('Number of people who can claim')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Ex: 10')
      .setMinLength(1)
      .setMaxLength(3)
      .setRequired(true);

    const amountRow = new ActionRowBuilder<TextInputBuilder>().addComponents(amountInput);
    const usersRow = new ActionRowBuilder<TextInputBuilder>().addComponents(usersInput);

    modal.addComponents(amountRow, usersRow);

    await interaction.showModal(modal);

  } catch (err: any) {
    log(`Error opening modal for @${interaction.user.username}: ${err.message}`, "err");
    await interaction.reply({
      content: "❌ An error occurred while opening the form",
      ephemeral: true
    });
  }
};

export { customId, invoke };
