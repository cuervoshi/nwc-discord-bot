
export const FAUCET_CONFIG = {
  MINIMUM_BALANCE: 1,
  MIN_SATS_PER_USER: 1,
  MAX_USERS: 100,
} as const;

export type FaucetConfigType = typeof FAUCET_CONFIG;
