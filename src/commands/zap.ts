import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";
import { updateUserRank } from "../handlers/donate.js";
import { log } from "../handlers/log.js";
import { EphemeralMessageResponse } from "../utils/helperFunctions.js";
import { zap } from "../handlers/zap.js";
import { ZapResult } from "../types/index.js";

const create = () => {
  const command = new SlashCommandBuilder()
    .setName("zap")
    .setDescription("Send sats to a user in discord")
    .addUserOption((opt) =>
      opt.setName("user").setDescription("User to zap").setRequired(true)
    )
    .addNumberOption((opt) =>
      opt
        .setName("amount")
        .setDescription("The amount of satoshis to transfer")
        .setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("message")
        .setDescription("A message for the transfer")
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
    const amountOption = interaction.options.get('amount');
    const messageOption = interaction.options.get('message');

    if (!receiverOption || !receiverOption.user) {
      throw new Error("User option is required");
    }

    if (!amountOption || typeof amountOption.value !== 'number') {
      throw new Error("Amount is required and must be a number");
    }

    const receiver = receiverOption;
    const amount: number = parseInt(amountOption.value.toString());

    log(
      `@${user.username} executed /zap ${receiver.user.username} ${amount}`,
      "info"
    );

    const receiverData = await interaction.guild!.members.fetch(
      receiver.user.id
    );

    const zapMessage: string = messageOption && typeof messageOption.value === 'string'
      ? messageOption.value
      : `${user.username} sent you ${amount} sats through discord`;

    const result: ZapResult = await zap(
      interaction,
      user,
      receiverData.user,
      amount,
      zapMessage
    );

    if (!result.success) {
      return EphemeralMessageResponse(interaction, result.message);
    } else {
      try {
        await updateUserRank(interaction.user.id, "comunidad", amount);

        log(
          `@${user.username} paid the zap invoice to @${receiver.user.username}`,
          "info"
        );

        await interaction.deleteReply();

        if (interaction.channel && interaction.channel.isTextBased()) {
          await interaction.channel.send({
            content: `${interaction.user.toString()} sent ${amount} satoshis to ${receiverData.toString()}`,
          });
        }
      } catch (err: any) {
        console.log(err);
        EphemeralMessageResponse(interaction, "An error occurred");
      }
    }
  } catch (err: any) {
    log(
      `Error in /zap command executed by @${interaction.user.username} - Error code ${err.code} Message: ${err.message}`,
      "err"
    );

    EphemeralMessageResponse(interaction, "An error occurred");
  }
};

export { create, invoke };
