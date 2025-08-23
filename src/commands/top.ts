import dedent from "dedent-js";
import { EmbedBuilder, SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";
import { getSumOfDonationAmounts, getTopRanking } from "../handlers/donate.js";
import { AuthorConfig } from "../utils/helperConfig.js";
import { formatter } from "../utils/helperFormatter.js";
import { log } from "../handlers/log.js";

interface TopUser {
  discord_id: string;
  amount: number;
}

const availableTypes = ["pozo", "comunidad"];


const create = () => {
  const command = new SlashCommandBuilder()
    .setName("top")
    .setDescription("Returns the TOP 10 ranking of users who sent sats")
    .addStringOption((opt) =>
      opt
        .setName("type")
        .setDescription(
          "Request a specific ranking (parameters: pool or community)"
        )
        .setRequired(false)
    );

  return command.toJSON();
};


const invoke = async (interaction: ChatInputCommandInteraction) => {
  try {
    const user = interaction.user;
    if (!user) return;

    await interaction.deferReply();

    const typeParam = interaction.options.get('type');

    const cleanedType: string =
      typeParam?.value && typeof typeParam.value === 'string' && availableTypes.includes(typeParam.value)
        ? typeParam.value
        : "pool";

    log(`@${user.username} executed /top ${cleanedType}`, "info");

    const isPool: boolean = cleanedType === "pool";

    const topUsers: TopUser[] = await getTopRanking(cleanedType);

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
      ${trophy} <@${user.discord_id}>  •  \`${formatter(0, 0).format(
          user.amount
        )} sats\`
        `;

        rankOutput = dedent(rankOutput);
      });

      const title: string = isPool
        ? "TOP 10 • pool donors"
        : "TOP 10 • users who gifted sats";

      const informationText: string = isPool
        ? "You can make donations using the /donate <amount> command"
        : "You can gift sats with the /zap and /faucet commands";

      const totalDonated: number = await getSumOfDonationAmounts(
        isPool ? "pool" : "community"
      );

      const embed = new EmbedBuilder()
        .setColor("#0099ff")
        .setAuthor(AuthorConfig)
        .addFields(
          { name: title, value: rankOutput },
          {
            name: isPool ? "Total donated" : "Total sent",
            value: `${formatter(0, 0).format(totalDonated)}`,
          },
          {
            name: "Information",
            value: informationText,
          }
        );

      await interaction.editReply({ embeds: [embed] });
    } else {
      const content: string = isPool
        ? "There are no users who have donated to the pool yet."
        : "There are no users who have sent sats yet.";

      await interaction.editReply({
        content,
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
