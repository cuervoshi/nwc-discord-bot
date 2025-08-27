import { Client, GatewayIntentBits, Collection, Partials } from "discord.js";
import { config } from "dotenv";
import { PrismaConfig } from "./utils/prisma.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { initializeBotAccount } from "./handlers/accounts.js";
import redisCache from "./handlers/RedisCache.js";
import { startHttpServer } from "./server/httpServer.js";
import { log } from "./handlers/log.js";

config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const token = process.env.BOT_TOKEN ?? "";

const client = new Client({
  partials: [
    Partials.User,
    Partials.Message,
    Partials.Channel,
    Partials.Reaction,
  ],
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildPresences,
  ],
});

client.commands = new Collection();
client.components = new Collection();

// Store HTTP server reference for graceful shutdown
let httpServer: any = null;

// Initialize database connection and bot
async function initializeBot() {
  try {
    // Initialize Prisma
    await PrismaConfig.initialize();

    // Initialize Redis connection
    try {
      await redisCache.connect();
    } catch (err) {
      log("❌ Error connecting to Redis: " + err, "err");
    }

    const botInitResult = await initializeBotAccount();

    if (botInitResult.success) {
      log(`✅ Bot service account ready - Balance: ${botInitResult.balance} sats`, "info");
    } else {
      log(`❌ Bot service account initialization failed: ${botInitResult.message}`, "err");
    }

    // Start HTTP server if enabled
    httpServer = startHttpServer();
  } catch (err) {
    log("❌ Error connecting to database: " + err, "err");
    process.exit(1);
  }
}

// Start the bot
initializeBot();

// Load commands and components
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

// Log when bot is ready to verify intents
client.once('ready', async () => {
  log(`🤖 Bot is ready! Logged in as ${client.user?.tag}`, "info");
  log(`🔧 Bot intents configured: Guilds, GuildMessages, MessageContent, GuildMembers, GuildMessageReactions`, "info");
  
  // Log guilds the bot is in
  log(`🏠 Bot is in ${client.guilds.cache.size} guilds:`, "info");
  client.guilds.cache.forEach(guild => {
    log(`  - ${guild.name} (${guild.id})`, "info");
  });
  
  // Load events after bot is ready
  const eventsPath = path.join(__dirname, "events");
  const eventFiles = fs
    .readdirSync(eventsPath)
    .filter((file) => file.endsWith(".js"));

  log(`Loading events from: ${eventsPath}`, "info");
  log(`Found event files: ${eventFiles.join(', ')}`, "info");

  for (let event of eventFiles) {
    const eventPath = path.join(eventsPath, event);
    log(`Loading event: ${event}`, "info");
    
    try {
      const eventModule = await import(`file://${eventPath}`);
      const eventData = eventModule.default || eventModule;

      log(`Event loaded: ${eventData.name} (once: ${eventData.once})`, "info");

      if (eventData.once) {
        client.once(eventData.name, (...args) => eventData.invoke(client, ...args));
        log(`Registered ONCE event: ${eventData.name}`, "info");
      } else {
        client.on(eventData.name, (...args) => eventData.invoke(client, ...args));
        log(`Registered ON event: ${eventData.name}`, "info");
      }
    } catch (error) {
      log(`Error loading event ${event}: ${error}`, "err");
    }
  }
});

// Graceful shutdown
process.on('SIGINT', async () => {
  log('\n🔄 Shutting down gracefully...', "info");
  
  // Close HTTP server if running
  if (httpServer) {
    httpServer.close(() => {
      log('HTTP server closed', "info");
    });
  }
  
  await redisCache.disconnect();
  await PrismaConfig.disconnect();
  log('Database connection closed', "info");
  process.exit(0);
});

process.on('SIGTERM', async () => {
  log('\n🔄 Shutting down gracefully...', "info");
  
  // Close HTTP server if running
  if (httpServer) {
    httpServer.close(() => {
      log('HTTP server closed', "info");
    });
  }
  
  await redisCache.disconnect();
  await PrismaConfig.disconnect();
  log('Database connection closed', "info");
  process.exit(0);
});
