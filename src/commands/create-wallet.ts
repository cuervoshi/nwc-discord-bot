import { SlashCommandBuilder, EmbedBuilder, ChatInputCommandInteraction } from "discord.js";
import { getAccount, createServiceWallet } from "../handlers/accounts.js";
import { log } from "../handlers/log.js";
import { formatter } from "#utils/helperFormatter";

const create = () => {
  const command = new SlashCommandBuilder()
    .setName("create-wallet")
    .setDescription("Create a new bot service wallet if you don't have any working account");

  return command.toJSON();
};

const invoke = async (interaction: ChatInputCommandInteraction) => {
  try {
    await interaction.deferReply({ ephemeral: true });

    const user = interaction.user;
    if (!user) throw new Error("No user interaction found");

    log(`@${user.username} executed /create-wallet`, "info");

    const existingAccount = await getAccount(interaction, user.id);
    
    if (existingAccount.success) {
      log(`@${user.username} already has a valid account - Balance: ${existingAccount.balance} sats`, "info");
      
      const accountType = existingAccount.isServiceAccount ? "bot service wallet" : "connected wallet";
      
      return await interaction.editReply({
        content: `❌ **You already have a working ${accountType}.**\n\n**Current balance:** ${formatter(0, 0).format(existingAccount.balance || 0)} satoshis\n\nIf you want to create a new bot service wallet, you need to:\n• Disconnect your current wallet using \`/disconnect\` (if you have one connected)\n• Or wait for your current bot service wallet to stop working`
      });
    }

    log(`@${user.username} doesn't have a valid account, creating new bot service wallet`, "info");

    const serviceWalletResult = await createServiceWallet(user.id, user.username);
    
    if (!serviceWalletResult.success) {
      log(`@${user.username} - Failed to create service wallet: ${serviceWalletResult.error}`, "err");
      
      return await interaction.editReply({
        content: `❌ **Failed to create bot service wallet.**\n\n**Error:** ${serviceWalletResult.error}\n\nPlease try again later or contact support.`
      });
    }

    if (!serviceWalletResult.account) {
      log(`@${user.username} - Service wallet created but no account returned`, "err");
      
      return await interaction.editReply({
        content: "❌ **Failed to create bot service wallet.**\n\nNo account data was returned. Please try again later or contact support."
      });
    }

    const newAccount = await getAccount(interaction, user.id);
    
    if (!newAccount.success) {
      log(`@${user.username} - Newly created service wallet validation failed: ${newAccount.message}`, "err");
      
      return await interaction.editReply({
        content: `❌ **Bot service wallet created but validation failed.**\n\n**Error:** ${newAccount.message}\n\nPlease try again later or contact support.`
      });
    }

    log(`@${user.username} - Bot service wallet created and validated successfully`, "info");

    const embed = new EmbedBuilder()
      .setAuthor({
        name: "Bot Service Wallet Created",
        iconURL: `https://cdn.discordapp.com/avatars/${interaction.user.id}/${interaction.user.avatar}`,
      })
      .addFields([
        {
          name: "Status",
          value: "✅ Bot service wallet created successfully",
        },
        {
          name: "Balance",
          value: `**${formatter(0, 0).format(newAccount.balance || 0)} satoshis**`,
        }
      ])
      .setFooter({
        text: "This is a custodial wallet managed by the bot. You can connect your own wallet anytime using /connect"
      });

    return await interaction.editReply({
      embeds: [embed]
    });

  } catch (err: any) {
    log(`Error in /create-wallet command executed by @${interaction.user.username} - Error: ${err.message}`, "err");
    
    return await interaction.editReply({
      content: "❌ **An unexpected error occurred while creating the wallet.**\n\nPlease try again later or contact support."
    });
  }
};

export { create, invoke };
