# Discord.js v14 - NWC Zap Bot

Rename .env.example to .env and replace your enviroment vars:

```env
# Discord bot authentication token
BOT_TOKEN=YOUR_BOT_TOKEN_ID

# MongoDB database connection URI
MONGODB_URI=mongodb+srv://<username>:<password>@<url>/<dbname>



# Alby Hub configuration (REQUIRED for bot service account)
ALBYHUB_URL=https://hub.getalby.com
ALBYHUB_TOKEN=your_alby_hub_api_token

# Salt for encrypting the nwc_uri
SALT=123456789
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
/help: Get help about commands
```
