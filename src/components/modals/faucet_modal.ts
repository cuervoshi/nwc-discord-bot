import { log } from "../../handlers/log.js";
import { validateAmountAndBalance } from "../../utils/helperFunctions.js";
import { getAndValidateAccount, getServiceAccount } from "../../handlers/accounts.js";
import { FAUCET_CONFIG, FAUCET_COMMISSION } from "../../utils/faucetConfig.js";
import { createFaucet, updateFaucetMessage } from "../../handlers/faucet.js";
import { ActionRowBuilder, ButtonBuilder, EmbedBuilder, ModalSubmitInteraction } from "discord.js";

interface AccountResult {
  success: boolean;
  message?: string;
  balance?: number;
  nwcClient?: {
    payInvoice: (params: { invoice: string }) => Promise<any>;
  };
}

interface ServiceAccountResult {
  success: boolean;
  message?: string;
  nwcClient?: {
    makeInvoice: (params: { amount: number; description: string }) => Promise<{ invoice: string }>;
  };
}

interface BalanceValidationResult {
  status: boolean;
  content: string;
}

const customId = "faucet_modal";

const invoke = async (interaction: ModalSubmitInteraction): Promise<void> => {
  try {
    await interaction.deferReply({ ephemeral: true });

    const amount = parseInt(interaction.fields.getTextInputValue('faucet_amount'));
    const users = parseInt(interaction.fields.getTextInputValue('faucet_users'));

    log(`@${interaction.user.username} envió modal: ${amount} sats para ${users} usuarios`, "info");

    if (!amount || amount <= 0) {
      await interaction.editReply({
        content: "❌ **Error:** El monto debe ser un número mayor a 0",
      });
      return;
    }

    if (!users || users <= 0) {
      await interaction.editReply({
        content: "❌ **Error:** La cantidad de personas debe ser un número mayor a 0",
      });
      return;
    }

    if (users > FAUCET_CONFIG.MAX_USERS) {
      await interaction.editReply({
        content: `❌ **Error:** Máximo ${FAUCET_CONFIG.MAX_USERS} personas pueden reclamar un faucet`,
      });
      return;
    }

    const userAccount: AccountResult = await getAndValidateAccount(interaction, interaction.user.id);
    if (!userAccount.success) {
      await interaction.editReply({
        content: userAccount.message,
      });
      return;
    }

    const { balance: userBalance } = userAccount;
    
    const satsPerUser = Math.floor(amount / users);
    const actualAmount = satsPerUser * users; 
    const totalCost = actualAmount + FAUCET_COMMISSION;

    const balanceValidation: BalanceValidationResult = validateAmountAndBalance(totalCost, userBalance || 0);
    if (!balanceValidation.status) {
      await interaction.editReply({
        content: `❌ **Saldo insuficiente:** ${balanceValidation.content}\n\n` +
          `💰 **Tu saldo:** ${userBalance} satoshis\n` +
          `💸 **Total necesario:** ${totalCost} satoshis (${actualAmount} + ${FAUCET_COMMISSION} de comisión)\n\n` +
          `ℹ️ **Nota:** De ${amount} sats solicitados, se distribuirán ${actualAmount} sats (${amount - actualAmount} sats se pierden por división)`,
      });
      return;
    }

    const serviceAccount: ServiceAccountResult = await getServiceAccount(interaction);
    if (!serviceAccount.success) {
      await interaction.editReply({
        content: serviceAccount.message,
      });
      return;
    }

    if (satsPerUser < FAUCET_CONFIG.MIN_SATS_PER_USER) {
      await interaction.editReply({
        content: `❌ **Error:** Con ${amount} satoshis para ${users} personas, cada uno recibiría menos de ${FAUCET_CONFIG.MIN_SATS_PER_USER} satoshi.\n\n` +
          `🎁 **Cada persona recibiría:** ${satsPerUser} satoshis\n\n` +
          ` **Sugerencias:**\n` +
          `• Aumenta el monto total\n` +
          `• Reduce la cantidad de personas\n` +
          `• Asegúrate de que el monto sea mayor o igual a la cantidad de personas`,
      });
      return;
    }

    await createFaucetWithMessage(interaction, actualAmount, users, satsPerUser, totalCost, userAccount, serviceAccount);

  } catch (err: any) {
    log(`Error procesando modal para @${interaction.user.username}: ${err.message}`, "err");
    
    try {
      await interaction.editReply({
        content: "❌ Ocurrió un error al procesar tu solicitud",
      });
    } catch (replyError) {
      await interaction.followUp({
        content: "❌ Ocurrió un error al procesar tu solicitud",
        ephemeral: true
      });
    }
  }
};

const createFaucetWithMessage = async (
  interaction: ModalSubmitInteraction, 
  actualAmount: number, 
  users: number, 
  satsPerUser: number, 
  totalCost: number, 
  userAccount: AccountResult, 
  serviceAccount: ServiceAccountResult
): Promise<void> => {
  try {
    log(`@${interaction.user.username} creando faucet: ${actualAmount} sats para ${users} usuarios (${satsPerUser} sats cada uno)`, "info");

    if (!serviceAccount.nwcClient) {
      throw new Error("No se pudo obtener la cuenta de servicio");
    }

    const invoice = await serviceAccount.nwcClient.makeInvoice({
      amount: totalCost * 1000,
      description: `Faucet de ${interaction.user.username}: ${actualAmount} sats para ${users} usuarios`,
    });

    log(`Invoice creado en cuenta de servicio: ${invoice.invoice}`, "info");

    if (!userAccount.nwcClient) {
      throw new Error("No se pudo obtener la cuenta del usuario");
    }

    const paymentResult = await userAccount.nwcClient.payInvoice({
      invoice: invoice.invoice,
    });

    log(`@${interaction.user.username} pagó ${totalCost} sats a la cuenta de servicio`, "info");

    const newFaucet = await createFaucet(
      interaction.user.id,
      interaction.user.username,
      satsPerUser,
      users
    );

    if (!newFaucet || !newFaucet._id) {
      await interaction.editReply({
        content: "❌ Ocurrió un error al crear el faucet en la base de datos",
      });
      return;
    }

    const faucetId = newFaucet._id.toString();

    const embed = new EmbedBuilder()
      .setAuthor({
        name: `${interaction.user.globalName}`,
        iconURL: `https://cdn.discordapp.com/avatars/${interaction.user.id}/${interaction.user.avatar}`,
      })
      .addFields([
        {
          name: `Faucet disponible:`,
          value: `${interaction.user.toString()} está regalando ${satsPerUser} sats a ${
            users === 1
              ? "1 persona"
              : `${users} personas \nPresiona reclamar para obtener tu premio. \n\n`
          }`,
        },
        {
          name: `Restantes: ${actualAmount}/${actualAmount} sats`,
          value: `${":x:".repeat(users)} \n\n`,
        },
      ])
      .setFooter({
        text: `Identificador: ${faucetId}`,
      });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents([
      new ButtonBuilder()
        .setCustomId("claim")
        .setLabel("Reclamar")
        .setEmoji({ name: `💸` })
        .setStyle(2),
      new ButtonBuilder()
        .setCustomId("closefaucet")
        .setLabel("Cerrar faucet")
        .setEmoji({ name: `✖️` })
        .setStyle(2),
    ]);

    const publicMessage = await interaction.channel!.send({
      embeds: [embed],
      components: [row],
    });

    await updateFaucetMessage(
      newFaucet,
      publicMessage.channelId,
      publicMessage.id
    );

    await interaction.editReply({
      content: `🎉 **¡Faucet creado exitosamente!**\n\n` +
        `💰 **Monto total:** ${actualAmount} satoshis\n` +
        `👥 **Personas:** ${users}\n` +
        `🎁 **Cada uno recibe:** ${satsPerUser} satoshis\n` +
        ` **Comisión:** ${FAUCET_COMMISSION} satoshis\n` +
        ` **Total cobrado:** ${totalCost} satoshis\n\n` +
        `✅ **Fondos transferidos a la cuenta de servicio**\n` +
        `📢 **Mensaje público enviado al canal**\n` +
        `El faucet está disponible para que otros usuarios lo reclamen.`,
    });

    log(
      `@${interaction.user.username} creó faucet exitosamente: ${faucetId}`,
      "info"
    );

  } catch (err: any) {
    log(`Error creando faucet para @${interaction.user.username}: ${err.message}`, "err");
    
    await interaction.editReply({
      content: `❌ **Error al crear el faucet:** ${err.message}\n\n` +
        `Verifica que tu billetera esté conectada y tenga saldo suficiente.`,
    });
  }
};

export { customId, invoke };
