import { Events, Interaction } from "discord.js";

const name = Events.InteractionCreate;
const once = false;

const invoke = async (client: any, interaction: Interaction) => {
  try {
    // Handle slash commands
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) {
        console.error(`No command matching ${interaction.commandName} was found.`);
        return;
      }

      try {
        await command.invoke(interaction);
      } catch (error) {
        console.error(`Error executing ${interaction.commandName}`);
        console.error(error);
      }
    }
    // Handle button interactions
    else if (interaction.isButton()) {
      const component = client.components.get(interaction.customId);
      if (!component) {
        console.error(`No component matching ${interaction.customId} was found.`);
        return;
      }

      try {
        await component.invoke(interaction);
      } catch (error) {
        console.error(`Error executing button ${interaction.customId}`);
        console.error(error);
      }
    }
    // Handle modal submissions
    else if (interaction.isModalSubmit()) {
      const component = client.components.get(interaction.customId);
      if (!component) {
        console.error(`No component matching ${interaction.customId} was found.`);
        return;
      }

      try {
        await component.invoke(interaction);
      } catch (error) {
        console.error(`Error executing modal ${interaction.customId}`);
        console.error(error);
      }
    }
  } catch (error) {
    console.error("Error al enviar comando");
    console.error(error);
  }
};

export default { name, once, invoke };
