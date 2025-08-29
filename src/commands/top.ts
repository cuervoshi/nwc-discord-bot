import dedent from "dedent-js";
import { EmbedBuilder, SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";
import { getSumOfDonationAmounts, getTopRanking } from "../handlers/ranking.js";
import { AuthorConfig } from "../utils/helperConfig.js";
import { formatBalance } from "../utils/helperFormatter.js";
import { log } from "../handlers/log.js";

interface TopUser {
  discord_id: string;
  amount: number;
}

const create = () => {
  const command = new SlashCommandBuilder()
    .setName("top")
    .setDescription("Returns the TOP 10 ranking of users who sent sats through the bot");

  return command.toJSON();
};

const invoke = async (interaction: ChatInputCommandInteraction) => {
  try {
    const user = interaction.user;
    if (!user) return;

    await interaction.deferReply();

    log(`@${user.username} executed /top`, "info");

    const topUsers: TopUser[] = await getTopRanking("sats_sent");

    let rankOutput: string = ``;
    if (topUsers && topUsers.length) {
      topUsers.forEach((user: TopUser, index: number) => {
        const trophy: string =
          index === 0
            ? ":first_place:"
            : index === 1
            ? ":second_place:"
            : index === 2
            ? ":third_place:"
            : ":medal:";

        rankOutput += `
      ${trophy} <@${user.discord_id}>  •  \`${formatBalance(
          user.amount
        )} sats\`
        `;

        rankOutput = dedent(rankOutput);
      });

      const totalSent: number = await getSumOfDonationAmounts("sats_sent");

      const embed = new EmbedBuilder()
        .setColor("#0099ff")
        .setAuthor(AuthorConfig)
        .addFields(
          { name: "TOP 10 • sats sent", value: rankOutput },
          {
            name: "Total sent",
            value: `${formatBalance(totalSent)}`,
          },
          {
            name: "Information",
            value: "You can send sats with the /zap and /faucet commands",
          }
        );

      await interaction.editReply({ embeds: [embed] });
    } else {
      await interaction.editReply({
        content: "There are no users who have sent sats yet.",
      });
    }
  } catch (err: any) {
    log(
      `Error in /top command executed by @${interaction.user.username} - Error code ${err.code} Message: ${err.message}`,
      "err"
    );

    await interaction.editReply({
      content: "An error occurred while getting the ranking",
    });
  }
};

export { create, invoke };
