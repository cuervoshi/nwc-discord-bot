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
    .setDescription("Devuelve el ranking TOP 10 usuarios que enviaron sats")
    .addStringOption((opt) =>
      opt
        .setName("tipo")
        .setDescription(
          "Solicita un ranking específico (parametros: pozo o comunidad)"
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

    const typeParam = interaction.options.get('tipo');

    const cleanedType: string =
      typeParam?.value && typeof typeParam.value === 'string' && availableTypes.includes(typeParam.value)
        ? typeParam.value
        : "pozo";

    log(`@${user.username} ejecutó /top ${cleanedType}`, "info");

    const isPool: boolean = cleanedType === "pozo";

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
        ? "TOP 10 • donadores al pozo"
        : "TOP 10 • usuarios que regalaron sats";

      const informationText: string = isPool
        ? "Puedes realizar donaciones utilizando el comando /donar <monto>"
        : "Puedes regalar sats con los comandos /zap y /regalar";

      const totalDonated: number = await getSumOfDonationAmounts(
        isPool ? "pozo" : "comunidad"
      );

      const embed = new EmbedBuilder()
        .setColor("#0099ff")
        .setAuthor(AuthorConfig)
        .addFields(
          { name: title, value: rankOutput },
          {
            name: isPool ? "Total donado" : "Total enviado",
            value: `${formatter(0, 0).format(totalDonated)}`,
          },
          {
            name: "Información",
            value: informationText,
          }
        );

      await interaction.editReply({ embeds: [embed] });
    } else {
      const content: string = isPool
        ? "Aún no hay usuarios que hayan donado al pozo."
        : "Aún no hay usuarios que hayan enviado sats.";

      await interaction.editReply({
        content,
      });
    }
  } catch (err: any) {
    log(
      `Error en el comando /top ejecutado por @${interaction.user.username} - Código de error ${err.code} Mensaje: ${err.message}`,
      "err"
    );

    await interaction.editReply({
      content: "Ocurrió un error al obtener el ranking",
    });
  }
};

export { create, invoke };
