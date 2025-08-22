import { NWCClient } from "@getalby/sdk";
import { Account } from "./account.js";
import { PaymentRequestObject, TagsObject } from "bolt11";

export interface BotConfig {
  token: string;
  mongoURI: string;
  poolAddress: string;
  lightningDomain: string;
  salt: string;
}

export interface Command {
  create: () => any;
  invoke: (interaction: any) => Promise<void>;
}

export interface Component {
  customId: string;
  invoke: (interaction: any) => Promise<void>;
}

export interface Event {
  name: string;
  once: boolean;
  invoke: (client: any, ...args: any[]) => Promise<void>;
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

export interface InvoiceResult {
  invoice: string;
}
