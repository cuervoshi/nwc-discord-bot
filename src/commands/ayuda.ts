import { commandsArray } from "#events/ready";
import dedent from "dedent-js";
import { EmbedBuilder, SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";
import { AuthorConfig } from "../utils/helperConfig.js";
import { EphemeralMessageResponse } from "../utils/helperFunctions.js";

interface CommandOption {
  name: string;
  type: number;
}

interface CommandData {
  name: string;
  description: string;
  options: CommandOption[];
}

interface CommandOutput {
  name: string;
  value: string;
}

const create = () => {
  const command = new SlashCommandBuilder()
    .setName("ayuda")
    .setDescription("Obtener ayuda sobre los comandos.");

  return command.toJSON();
};

const invoke = async (interaction: ChatInputCommandInteraction) => {
  try {
    await interaction.deferReply({ ephemeral: true });

    const cmdOutput: CommandOutput[] = [];
    
    commandsArray.forEach((cmd: CommandData) => {
      if (cmd.name !== "ayuda") {
        let params = "";
        cmd.options.forEach((opt: CommandOption) => {
          params += `${opt.name}: <${opt.type}> `;
        });

        cmdOutput.push({
          name: `${cmd.name[0].toUpperCase()}${cmd.name.substring(
            1,
            cmd.name.length
          )} - (\`/${cmd.name}${params ? ` ${params.trimEnd()}` : ""}\`)`,
          value: `${cmd.description}\n`,
        });
      }
    });

    if (!cmdOutput.length) {
      return EphemeralMessageResponse(interaction, "No hay comandos");
    }

    const embed = new EmbedBuilder()
      .setColor("#0099ff")
      .setAuthor(AuthorConfig)
      .setDescription(
        dedent(`
    Este bot le permite interactuar con otros usuarios utilizando el poder de la red lightning. Ya tienes una billetera asociada a tu usuario, puedes utilizarla con los comandos que se definen a continuación:
    `)
      )
      .addFields(
        { name: "\u200B", value: "\u200B" },
        ...cmdOutput.map((cmd) => cmd)
      );

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    console.log(err);
    EphemeralMessageResponse(interaction, "Ocurrió un error");
  }
};

export { create, invoke };
