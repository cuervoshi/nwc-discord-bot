import { log } from "../../handlers/log.js";
import { validateAmountAndBalance } from "../../utils/helperFunctions.js";
import { getAndValidateAccount, getServiceAccount } from "../../handlers/accounts.js";
import { FAUCET_CONFIG } from "../../utils/faucetConfig.js";
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

    log(`@${interaction.user.username} submitted modal: ${amount} sats for ${users} users`, "info");

    if (!amount || amount <= 0) {
      await interaction.editReply({
        content: "❌ **Error:** The amount must be a number greater than 0",
      });
      return;
    }

    if (!users || users <= 0) {
      await interaction.editReply({
        content: "❌ **Error:** The number of people must be a number greater than 0",
      });
      return;
    }

    if (users > FAUCET_CONFIG.MAX_USERS) {
      await interaction.editReply({
        content: `❌ **Error:** Maximum ${FAUCET_CONFIG.MAX_USERS} people can claim a faucet`,
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
    const totalCost = satsPerUser * users; 

    const balanceValidation: BalanceValidationResult = validateAmountAndBalance(totalCost, userBalance || 0);
    if (!balanceValidation.status) {
      await interaction.editReply({
        content: `❌ **Insufficient balance:** ${balanceValidation.content}\n\n` +
          `💰 **Your balance:** ${userBalance} satoshis\n` +
          `💸 **Total needed:** ${totalCost} satoshis\n\n` +
          `ℹ️ **Note:** From ${amount} requested sats, ${totalCost} sats will be distributed (${amount - totalCost} sats are lost due to division)`,
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
        content: `❌ **Error:** With ${amount} satoshis for ${users} people, each would receive less than ${FAUCET_CONFIG.MIN_SATS_PER_USER} satoshi.\n\n` +
          `**Each person would receive:** ${satsPerUser} satoshis\n\n` +
          ` **Suggestions:**\n` +
          `• Increase the total amount\n` +
          `• Reduce the number of people\n` +
          `• Make sure the amount is greater than or equal to the number of people`,
      });
      return;
    }

    await createFaucetWithMessage(interaction, users, satsPerUser, totalCost, userAccount, serviceAccount);

  } catch (err: any) {
    log(`Error processing modal for @${interaction.user.username}: ${err.message}`, "err");
    
    try {
      await interaction.editReply({
        content: "❌ An error occurred while processing your request",
      });
    } catch (replyError) {
      await interaction.followUp({
        content: "❌ An error occurred while processing your request",
        ephemeral: true
      });
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

    const paymentResult = await userAccount.nwcClient.payInvoice({
      invoice: invoice.invoice,
    });

    log(`@${interaction.user.username} paid ${totalCost} sats to the service account`, "info");

    const newFaucet = await createFaucet(
      interaction.user.id,
      interaction.user.username,
      satsPerUser,
      users
    );

    if (!newFaucet || !newFaucet._id) {
      await interaction.editReply({
        content: "❌ An error occurred while creating the faucet in the database",
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
          name: `Available faucet:`,
          value: `${interaction.user.toString()} is gifting ${satsPerUser} sats to ${
            users === 1
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

    await interaction.editReply({
      content: `🎉 **Faucet created successfully!**\n\n` +
        `💰 **Total amount:** ${totalCost} satoshis\n` +
        `👥 **People:** ${users}\n` +
        `🎁 **Each receives:** ${satsPerUser} satoshis\n` +
        `✅ **Funds transferred to service account**\n` +
        `The faucet is available for other users to claim.`,
    });

    log(
      `@${interaction.user.username} successfully created faucet: ${faucetId}`,
      "info"
    );

  } catch (err: any) {
    log(`Error creating faucet for @${interaction.user.username}: ${err.message}`, "err");
    
    await interaction.editReply({
      content: `❌ **Error creating faucet:** ${err.message}\n\n` +
        `Make sure your wallet is connected and has sufficient balance.`,
    });
  }
};

export { customId, invoke };
