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
    .setName("help")
    .setDescription("Get help about commands.");

  return command.toJSON();
};

const invoke = async (interaction: ChatInputCommandInteraction) => {
  try {
    await interaction.deferReply({ ephemeral: true });

    const cmdOutput: CommandOutput[] = [];
    
    commandsArray.forEach((cmd: CommandData) => {
      if (cmd.name !== "help") {
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
      return EphemeralMessageResponse(interaction, "No commands available");
    }

    const embed = new EmbedBuilder()
      .setColor("#0099ff")
      .setAuthor(AuthorConfig)
      .setDescription(
        dedent(`
    This bot allows you to interact with other users using the power of the lightning network. You already have a wallet associated with your user, you can use it with the commands defined below:
    `)
      )
      .addFields(
        { name: "\u200B", value: "\u200B" },
        ...cmdOutput.map((cmd) => cmd)
      );

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    console.log(err);
    EphemeralMessageResponse(interaction, "An error occurred");
  }
};

export { create, invoke };
