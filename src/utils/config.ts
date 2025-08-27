// General bot configuration
export const BOT_CONFIG = {
  ROUTING_FEE_PERCENTAGE: 0.005,
  MIN_ROUTING_FEE_RESERVE: 10,
  SERVICE_ACCOUNT_COMMISSION: 0.005, //Use 0.00 - 1.00 for the commission percentage (0.005 = 0.5%)
  LIGHTNING_DOMAIN: process.env.LIGHTNING_DOMAIN || null,
  HTTP_SERVER: {
    ENABLED: process.env.HTTPSERVER_ENABLED === 'true',
    PORT: parseInt(process.env.HTTPSERVER_PORT || '8001'),
  },
} as const;

// Faucet-specific configuration
export const FAUCET_CONFIG = {
  MINIMUM_BALANCE: 1,
  MIN_SATS_PER_USER: 1,
  MAX_USERS: 100,
} as const;

export type BotConfigType = typeof BOT_CONFIG;
export type FaucetConfigType = typeof FAUCET_CONFIG;
