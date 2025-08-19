import { Client, GatewayIntentBits, Collection } from "discord.js";
import { config } from "dotenv";
import { connect } from "mongoose";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const mongoURI = process.env.MONGODB_URI ?? "";
const token = process.env.BOT_TOKEN ?? "";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions,
  ],
});

client.commands = new Collection();
client.components = new Collection();

connect(mongoURI)
  .then(() => {
    console.log("✅ Conectado a MongoDB");
  })
  .catch((err) => {
    console.error("❌ Error conectando a MongoDB:", err);
  });

const eventsPath = path.join(__dirname, "events");
const eventFiles = fs
  .readdirSync(eventsPath)
  .filter((file) => file.endsWith(".js"));

for (let event of eventFiles) {
  const eventPath = path.join(eventsPath, event);
  const eventModule = await import(`file://${eventPath}`);
  const eventData = eventModule.default || eventModule;

  if (eventData.once) {
    client.once(eventData.name, (...args) => eventData.invoke(client, ...args));
  } else {
    client.on(eventData.name, (...args) => eventData.invoke(client, ...args));
  }
}

const commandsPath = path.join(__dirname, "commands");
const commandFiles = fs
  .readdirSync(commandsPath)
  .filter((file) => file.endsWith(".js")); 

for (let command of commandFiles) {
  const commandPath = path.join(commandsPath, command);
  const commandModule = await import(`file://${commandPath}`);
  const commandData = commandModule.default || commandModule;

  client.commands.set(commandData.create().name, commandData);
}

const componentsPath = path.join(__dirname, "components");
const componentFolders = fs.readdirSync(componentsPath);

for (let folder of componentFolders) {
  const componentFolderPath = path.join(componentsPath, folder);
  const componentFiles = fs
    .readdirSync(componentFolderPath)
    .filter((file) => file.endsWith(".js"));

  for (let component of componentFiles) {
    const componentPath = path.join(componentFolderPath, component);
    const componentModule = await import(`file://${componentPath}`);
    const componentData = componentModule.default || componentModule;

    client.components.set(componentData.customId, componentData);
  }
}

client.login(token);
