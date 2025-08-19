export const FAUCET_COMMISSION: number = 5;

export const FAUCET_CONFIG = {
  MINIMUM_BALANCE: FAUCET_COMMISSION + 1,
  MIN_SATS_PER_USER: 1,
  MAX_USERS: 100,
} as const;

export type FaucetConfigType = typeof FAUCET_CONFIG;
