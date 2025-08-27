import { NWCClient } from "@getalby/sdk";
import type { Account } from "./prisma.js";
import { PaymentRequestObject, TagsObject } from "bolt11";
import { Interaction } from "discord.js";
import { ExtendedClient } from "./discord.js";

// Re-export Prisma types for convenience
export type { 
  Account, 
  Faucet, 
  Rank,
  AccountWithRelations,
  FaucetWithRelations,
  RankWithRelations,
  AccountCreateInput,
  FaucetCreateInput,
  RankCreateInput,
  AccountUpdateInput,
  FaucetUpdateInput,
  RankUpdateInput,
  AccountQueryResult,
  FaucetQueryResult,
  RankQueryResult,
  AccountListResult,
  FaucetListResult,
  RankListResult
} from "./prisma.js";

export interface Command {
  create: () => any;
  invoke: (interaction: Interaction) => Promise<void>;
}

export interface Component {
  customId: string;
  invoke: (interaction: Interaction) => Promise<void>;
}

export interface Event {
  name: string;
  once: boolean;
  invoke: (client: ExtendedClient, ...args: any[]) => Promise<void>;
}

export interface AccountResult {
  success: boolean;
  message?: string;
  balance?: number;
  nwcClient?: NWCClient;
  userAccount?: Account;
  isServiceAccount?: boolean;
  accountInfo?: {
    type: string;
    purpose: string;
    balance: number;
  };
}

export interface ServiceAccountResult {
  success: boolean;
  message?: string;
  nwcClient?: NWCClient;
  balance?: number;
  isServiceAccount?: boolean;
  encryptedNwcUri?: string;
  accountInfo?: {
    type: string;
    purpose: string;
    balance: number;
  };
}

export interface ZapResult {
  success: boolean;
  message: string;
}

export interface BalanceValidationResult {
  status: boolean;
  content: string;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export interface ConnectionTestResult {
  valid: boolean;
  balance?: number;
  error?: string;
}

export interface BOLT11ValidationResult {
  valid: boolean;
  error?: string;
  decoded?: PaymentRequestObject & { tagsObject: TagsObject };
  amount?: number;
  description?: string;
  timestamp?: number;
  timeExpireDate?: number;
}