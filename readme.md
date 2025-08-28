# Discord.js v14 - NWC Zap Bot

A Discord bot that allows users to connect Lightning Network wallets through Nostr Wallet Connect (NWC) and send/receive satoshis. If you don't have a Lightning account, the bot automatically creates one associated with your Discord user using AlbyHub as the backend.

**Fee Structure:** The bot charges a configurable commission (default: 0.5%) on all transfers made with accounts created by the bot. This can be adjusted in the configuration.

## Setup

Rename .env.example to .env and replace your enviroment vars:

```env
# Discord bot authentication token
BOT_TOKEN=YOUR_BOT_TOKEN_ID

# PostgreSQL database connection URI
DATABASE_URL=postgresql://<user>:<password>@localhost:5432/<dbname>

# Redis connection URL (defaults to localhost:6379)
REDIS_URL=redis://localhost:6379

# Alby Hub configuration (REQUIRED for bot service account)
ALBYHUB_URL=https://hub.getalby.com
ALBYHUB_TOKEN=your_alby_hub_api_token

# Salt for encrypting the nwc_uri
SALT=123456789

# HTTP Server configuration (optional)
HTTPSERVER_ENABLED=true
HTTPSERVER_PORT=8001
```

## Configuration

You can customize the bot's behavior by editing `src/utils/config.ts`:

```jsonc
{
  "SERVICE_ACCOUNT_COMMISSION": 0.005, //Commission rate for service accounts (default: 0.005 = 0.5%)
  "ROUTING_FEE_PERCENTAGE": 0.005, //Percentage of transaction amount reserved for routing fee (default: 0.005 = 0.5%)
  "MIN_ROUTING_FEE_RESERVE": 10 //Minimum sats reserved for routing fees (default: 10)
}
```

# Start bot

```
pnpm install
```

```
pnpm build
```

```
pnpm start
```

# Run docker

```
docker-compose up --build
```

# Available commands

```bash
/balance: Returns your wallet balance.
/pay bolt11: <string>: Pay a lightning network invoice
/recharge amount: <integer> : Recharge your lightning network account with an invoice
/send address: <string> amount: <integer> : Withdraw satoshis to an external account outside discord
/request amount: <integer> description: <string> : Request payment for an invoice
/faucet: Create an open invoice that any user can claim
/top: Returns the TOP 10 ranking of users who sent sats through the bot
/zap user: <user> amount: <integer> message: <string>: Send sats to a user in discord
/reaction-config: Configure your zap reactions settings (enable/disable and amount)
/connect nwc_uri: <string>: Connect your wallet through Nostr Wallet Connect
/disconnect: Disconnect your wallet from the bot
/help: Get help about commands
```

## HTTP Server

The bot includes an optional HTTP server that can be enabled via environment variables. When enabled, it exposes endpoints for creating invoices for Discord users using their username. This functionality enables Lightning Addresses (LUD16) support, allowing users to receive payments through their Discord username. The server runs on the port specified in `HTTPSERVER_PORT` (default: 8001) and is accessible at `http://localhost:${HTTPSERVER_PORT}` when running with Docker.

### TODO - Upcoming Endpoints

- [ ] **Discord Authentication**: Auth with Discord login
- [ ] **Invoice Payment**: Pay invoice with token authentication
- [ ] **Wallet WebApp**: Web interface that allows you to connect with Discord and manage your account from there