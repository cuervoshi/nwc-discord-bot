import { log } from "../../handlers/log.js";
import { validateAmountAndBalance, formatErrorMessage, formatSuccessMessage, handleInvoicePayment } from "../../utils/helperFunctions.js";
import { getAccount, getBotServiceAccount } from "../../handlers/accounts.js";
import { FAUCET_CONFIG, BOT_CONFIG } from "../../utils/config.js";
import { createFaucet, updateFaucetMessage } from "../../handlers/faucet.js";
import { ActionRowBuilder, ButtonBuilder, EmbedBuilder, ModalSubmitInteraction } from "discord.js";
import { AccountResult, ServiceAccountResult, BalanceValidationResult } from "../../types/index.js";

const customId = "faucet_modal";

const invoke = async (interaction: ModalSubmitInteraction): Promise<void> => {
  try {
    await interaction.deferReply({ ephemeral: true });

    const amount = parseInt(interaction.fields.getTextInputValue('faucet_amount'));
    const users = parseInt(interaction.fields.getTextInputValue('faucet_users'));

    log(`@${interaction.user.username} submitted modal: ${amount} sats for ${users} users`, "info");

    if (!amount || amount <= 0) {
      await interaction.editReply(formatErrorMessage("Invalid amount", "The amount must be a number greater than 0"));
      return;
    }

    if (!users || users <= 0) {
      await interaction.editReply(formatErrorMessage("Invalid number of people", "The number of people must be a number greater than 0"));
      return;
    }

    if (users > FAUCET_CONFIG.MAX_USERS) {
      await interaction.editReply(formatErrorMessage("Too many people", `Maximum ${FAUCET_CONFIG.MAX_USERS} people can claim a faucet`));
      return;
    }

    const userAccount: AccountResult = await getAccount(interaction, interaction.user.id);
    if (!userAccount.success) {
      await interaction.editReply({
        content: userAccount.message,
      });
      return;
    }

    const { balance: userBalance } = userAccount;

    const satsPerUser = Math.floor(amount / users);
    const totalCost = satsPerUser * users;

    const balanceValidation: BalanceValidationResult = validateAmountAndBalance(totalCost, userBalance || 0);

    const routingFee = Math.ceil(userBalance * BOT_CONFIG.ROUTING_FEE_PERCENTAGE);
    const totalReserve = Math.max(routingFee, BOT_CONFIG.MIN_ROUTING_FEE_RESERVE);

    if (!balanceValidation.status) {
      const availableBalance = Math.max(0, userBalance - totalReserve);
      const errorContent = `${balanceValidation.content}\n\n` +
        `**Your available balance:** ${availableBalance.toLocaleString()} satoshis (routing fee is reserved - ${totalReserve} sats)\n` +
        `**Total needed:** ${totalCost.toLocaleString()} satoshis`;

      await interaction.editReply(formatErrorMessage("Insufficient balance", errorContent));
      return;
    }

    const serviceAccount: ServiceAccountResult = await getBotServiceAccount();
    if (!serviceAccount.success) {
      await interaction.editReply({
        content: serviceAccount.message,
      });
      return;
    }

    if (satsPerUser < FAUCET_CONFIG.MIN_SATS_PER_USER) {
      const errorContent = `With ${amount.toLocaleString()} satoshis for ${users} people, each would receive less than ${FAUCET_CONFIG.MIN_SATS_PER_USER} satoshi.\n\n` +
        `**Each person would receive:** ${satsPerUser} satoshis\n\n` +
        `**Suggestions:**\n` +
        `• Increase the total amount\n` +
        `• Reduce the number of people\n` +
        `• Make sure the amount is greater than or equal to the number of people`;

      await interaction.editReply(formatErrorMessage("Amount too low per person", errorContent));
      return;
    }

    await createFaucetWithMessage(interaction, users, satsPerUser, totalCost, userAccount, serviceAccount);

  } catch (err: any) {
    log(`Error processing modal for @${interaction.user.username}: ${err.message}`, "err");

    try {
      await interaction.editReply(formatErrorMessage("Processing error", "An error occurred while processing your request"));
    } catch (replyError) {
      await interaction.followUp(formatErrorMessage("Processing error", "An error occurred while processing your request"));
    }
  }
};

const createFaucetWithMessage = async (
  interaction: ModalSubmitInteraction,
  users: number,
  satsPerUser: number,
  totalCost: number,
  userAccount: AccountResult,
  serviceAccount: ServiceAccountResult
): Promise<void> => {
  try {
    log(`@${interaction.user.username} creating faucet: ${totalCost} sats for ${users} users (${satsPerUser} sats each)`, "info");

    if (!serviceAccount.nwcClient) {
      throw new Error("Could not get service account");
    }

    const invoice = await serviceAccount.nwcClient.makeInvoice({
      amount: totalCost * 1000,
      description: `Faucet from ${interaction.user.username}: ${totalCost} sats for ${users} users`,
    });

    log(`Invoice created in service account: ${invoice.invoice}`, "info");

    if (!userAccount.nwcClient) {
      throw new Error("Could not get user account");
    }

    const paymentResult = await handleInvoicePayment(
      userAccount.nwcClient,
      invoice.invoice,
      userAccount.isServiceAccount || false,
      interaction.user.username
    );

    if (!paymentResult.success) {
      throw new Error(paymentResult.error || "Could not pay invoice");
    }

    log(`@${interaction.user.username} paid ${totalCost} sats to the service account`, "info");

    const newFaucet = await createFaucet(
      interaction.user.id,
      interaction.user.username,
      satsPerUser,
      users
    );

    if (!newFaucet || !newFaucet.id) {
      await interaction.editReply(formatErrorMessage("Database error", "An error occurred while creating the faucet in the database"));
      return;
    }

    const faucetId = newFaucet.id;

    const embed = new EmbedBuilder()
      .setAuthor({
        name: `${interaction.user.globalName}`,
        iconURL: `https://cdn.discordapp.com/avatars/${interaction.user.id}/${interaction.user.avatar}`,
      })
      .addFields([
        {
          name: `Available faucet:`,
          value: `${interaction.user.toString()} is gifting ${satsPerUser} sats to ${users === 1
              ? "1 person"
              : `${users} people \nPress claim to get your reward. \n\n`
            }`,
        },
        {
          name: `Remaining: ${totalCost}/${totalCost} sats`,
          value: `${":x:".repeat(users)} \n\n`,
        },
      ])
      .setFooter({
        text: `Identifier: ${faucetId}`,
      });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents([
      new ButtonBuilder()
        .setCustomId("claim")
        .setLabel("Claim")
        .setEmoji({ name: `💸` })
        .setStyle(2),
      new ButtonBuilder()
        .setCustomId("closefaucet")
        .setLabel("Close faucet")
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

    const successContent = `**Total amount:** ${totalCost.toLocaleString()} satoshis\n\n` +
      `**People to receive:** ${users}\n` +
      `**Each receives:** ${satsPerUser.toLocaleString()} satoshis\n\n` +
      `**Funds transferred to service account**\n` +
      `The faucet is available for other users to claim.`;

    await interaction.editReply(formatSuccessMessage("Faucet created successfully!", successContent));

    log(
      `@${interaction.user.username} successfully created faucet: ${faucetId}`,
      "info"
    );

  } catch (err: any) {
    log(`Error creating faucet for @${interaction.user.username}: ${err.message}`, "err");

    const errorContent = `${err.message}\n\n**Please ensure you have allowed at least 10 sats for routing fees in your NWC connection, as this is often the cause of payment failures.**\n\nMake sure your wallet is connected and has sufficient balance.`;
    await interaction.editReply(formatErrorMessage("Error creating faucet", errorContent));
  }
};

export { customId, invoke };
