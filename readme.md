# Discord.js v14 - NWC Zap Bot

A Discord bot that allows users to connect Lightning Network wallets through Nostr Wallet Connect (NWC) and send/receive satoshis. If you don't have a Lightning account, the bot automatically creates one associated with your Discord user using AlbyHub as the backend.

**Fee Structure:** The bot charges a configurable commission (default: 0.5%) on all transfers made with accounts created by the bot. This can be adjusted in the configuration.

## Setup

Rename .env.example to .env and replace your enviroment vars:

```env
# Discord bot authentication token
BOT_TOKEN=YOUR_BOT_TOKEN_ID

# MongoDB database connection URI
MONGODB_URI=mongodb+srv://<username>:<password>@<url>/<dbname>

# Redis connection URL (defaults to localhost:6379)
REDIS_URL=redis://localhost:6379

# Alby Hub configuration (REQUIRED for bot service account)
ALBYHUB_URL=https://hub.getalby.com
ALBYHUB_TOKEN=your_alby_hub_api_token

# Salt for encrypting the nwc_uri
SALT=123456789
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
/connect nwc_uri: <string>: Connect your wallet through Nostr Wallet Connect
/disconnect: Disconnect your wallet from the bot
/help: Get help about commands
```
