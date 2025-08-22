import AccountModel from "../schemas/AccountSchema.js";
import { encryptData, decryptData } from "../utils/crypto.js";
import { NWCClient } from "@getalby/sdk";
import { log } from "./log.js";
import { validateNWCURI, testNWCConnection } from "../utils/helperFunctions.js";
import SimpleCache from "./SimpleCache.js";
import { Interaction } from "discord.js";
import { Account } from "../types/account.js";

interface AccountResult {
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

interface ServiceAccountResult {
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

const accountsCache = new SimpleCache();

const SALT: string = process.env.SALT ?? "";

const SERVICE_NWC_URI: string = process.env.SERVICE_NWC_URI ?? "";

const createOrUpdateAccount = async (discord_id: string, discord_username: string, nwc_uri: string): Promise<Account | null> => {
  try {
    const userAccount = await (AccountModel as any).findOne({ discord_id });
    if (userAccount) {
      accountsCache.delete(`account:${discord_id}`);
      userAccount.nwc_uri = encryptData(nwc_uri, SALT);
      await userAccount.save();

      return userAccount as Account;
    }

    const newAccount = new AccountModel({
      discord_id,
      discord_username,
      nwc_uri: encryptData(nwc_uri, SALT),
    });

    await newAccount.save();

    return newAccount as Account;
  } catch (err: any) {
    console.log(err);
    return null;
  }
};

const getServiceAccount = async (interaction: Interaction): Promise<ServiceAccountResult> => {
  try {
    const cachedAccount = accountsCache.get(`account:service`) as ServiceAccountResult;
    if (cachedAccount) return cachedAccount;

    log(`Getting service account for faucets`, "info");

    const formatValidation = validateNWCURI(SERVICE_NWC_URI);
    if (!formatValidation.valid) {
      log(`Invalid service NWC URI: ${formatValidation.error}`, "err");
      return {
        success: false,
        message: `❌ **Service configuration error:** ${formatValidation.error}`
      };
    }

    const connectionTest = await testNWCConnection(SERVICE_NWC_URI);
    if (!connectionTest.valid) {
      log(`Service NWC connection error: ${connectionTest.error}`, "err");
      return {
        success: false,
        message: `❌ **Service connection error:** ${connectionTest.error}`
      };
    }

    const nwcClient = new NWCClient({
      nostrWalletConnectUrl: SERVICE_NWC_URI
    });

    log(`Service account validated successfully - Balance: ${connectionTest.balance} sats`, "info");

    const createdAccount: ServiceAccountResult = {
      success: true,
      nwcClient,
      balance: connectionTest.balance,
      isServiceAccount: true, // Flag para identificar que es cuenta de servicio
      accountInfo: {
        type: 'service',
        purpose: 'faucet_management',
        balance: connectionTest.balance
      }
    };

    accountsCache.set(`account:service`, createdAccount, 7200000);
    return createdAccount;
  } catch (err: any) {
    log(`Error getting service account: ${err.message}`, "err");
    return {
      success: false,
      message: "❌ **Unexpected error getting the service account.**"
    };
  }
};

const getAndValidateAccount = async (interaction: Interaction, discord_id: string): Promise<AccountResult> => {
  try {
    const userData = await interaction.guild!.members.fetch(discord_id);

    const cachedAccount = accountsCache.get(`account:${discord_id}`) as AccountResult;
    if (cachedAccount && cachedAccount.success) {
      try {
        log(`@${userData.user.username} - using cached account, updating balance`, "info");
        
        const currentBalance = await cachedAccount.nwcClient!.getBalance();
        const updatedBalance = Number(currentBalance.balance.toString()) / 1000;
        
        cachedAccount.balance = updatedBalance;
        
        log(`@${userData.user.username} - balance updated: ${updatedBalance} sats`, "info");
        
        return cachedAccount;
      } catch (balanceError: any) {
        log(`@${userData.user.username} - error updating cached balance: ${balanceError.message}`, "err");
      }
    }
    
    const userAccount = await (AccountModel as any).findOne({ discord_id });
    if (!userAccount) {
      log(`@${userData.user.username} doesn't have a registered account`, "err");

      if (interaction.user!.id === discord_id) {
        return {
          success: false,
          message: "❌ **You don't have a registered account.**\n\nUse the `/connect` command to connect your NWC wallet."
        }
      } else {
        return {
          success: false,
          message: "❌ **The user you're trying to send to doesn't have a registered account.**"
        }
      }
    }

    const nwcUri = decryptData(userAccount.nwc_uri, SALT);
    if (!nwcUri) {
      log(`@${userData.user.username} - Error decrypting NWC URI`, "err");

      if (interaction.user!.id === discord_id) {
        return {
          success: false,
          message: "❌ **Error recovering your NWC connection.**\n\nUse the `/connect` command to reconnect your wallet."
        }
      } else {
        return {
          success: false,
          message: "❌ **Error recovering the user's NWC connection.**"
        }
      }
    }

    const formatValidation = validateNWCURI(nwcUri);
    if (!formatValidation.valid) {
      log(`@${userData.user.username} - Invalid NWC URI: ${formatValidation.error}`, "err");

      if (interaction.user!.id === discord_id) {
        return {
          success: false,
          message: `❌ **Invalid connection URI:** ${formatValidation.error}\n\nUse the \`/connect\` command to reconnect your wallet.`
        }
      } else {
        return {
          success: false,
          message: `❌ **The connection URI of the user you're trying to send to is invalid.**`
        }
      }
    }

    const connectionTest = await testNWCConnection(nwcUri);
    if (!connectionTest.valid) {
      log(`@${userData.user.username} - NWC connection error: ${connectionTest.error}`, "err");

      return {
        success: false,
        message: `❌ **Connection error:** ${connectionTest.error}\n\nVerify that your wallet or the user's wallet you're trying to send to is properly connected. Use \`/connect\` to reconnect if necessary.`
      }
    }

    const nwcClient = new NWCClient({
      nostrWalletConnectUrl: nwcUri
    });

    log(`@${userData.user.username} - NWC connection validated successfully`, "info");

    const createdAccount: AccountResult = {
      success: true,
      nwcClient,
      balance: connectionTest.balance,
      userAccount: userAccount as Account
    };

    accountsCache.set(`account:${discord_id}`, createdAccount, 7200000);
    return createdAccount;
  } catch (err: any) {
    log(`Unexpected error validating account: ${err.message}`, "err");
    return {
      success: false,
      message: "❌ **Unexpected error validating your account.**\n\nUse the `/connect` command to reconnect your wallet."
    }
  }
};

export { createOrUpdateAccount, getAndValidateAccount, getServiceAccount };
