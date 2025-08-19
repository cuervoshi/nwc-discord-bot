import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { log } from "../handlers/log.js";
import { ExtendedClient } from "../types/discord.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const once = true;
const name = "ready";

export let commandsArray: any[] = [];

async function invoke(client: ExtendedClient) {
  commandsArray = [];

  const commandsPath = path.join(__dirname, "..", "commands");
  const commands = fs
    .readdirSync(commandsPath)
    .filter((file) => file.endsWith(".js") || file.endsWith(".ts"))
    .map((file) => file.slice(0, -3));

  for (let command of commands) {
    log(`Added /${command} slash command`, "info");
    const commandFile = await import(`#commands/${command}`);
    commandsArray.push(commandFile.create());
  }

  client.application.commands.set(commandsArray);

  log(`Successfully logged in as ${client.user.tag}!`, "done");
}

export { once, name, invoke };
