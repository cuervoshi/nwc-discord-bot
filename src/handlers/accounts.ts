import AccountModel from "../schemas/AccountSchema.js";
import { encryptData, decryptData } from "../utils/crypto.js";
import { NWCClient } from "@getalby/sdk";
import { log } from "./log.js";
import { validateNWCURI, testNWCConnection, requiredEnvVar } from "../utils/helperFunctions.js";
import SimpleCache from "./SimpleCache.js";
import { Interaction } from "discord.js";
import { Account } from "../types/account.js";
import { AccountResult, ServiceAccountResult } from "../types/index.js";

const accountsCache = new SimpleCache();
const SALT: string = process.env.SALT ?? "";

// Remove SERVICE_NWC_URI dependency
// const SERVICE_NWC_URI: string = process.env.SERVICE_NWC_URI ?? "";

const connectAccount = async (discord_id: string, discord_username: string, nwc_uri: string): Promise<Account | null> => {
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

const connectUserAccount = async (discord_id: string, discord_username: string, nwc_uri: string): Promise<{ success: boolean; message?: string }> => {
  try {
    const validationResult = await validateAccount(nwc_uri, discord_username);
    if (!validationResult.success) {
      return {
        success: false,
        message: validationResult.message
      };
    }

    const userAccount = await (AccountModel as any).findOne({ discord_id });
    if (userAccount) {
      userAccount.nwc_uri = encryptData(nwc_uri, SALT);
      userAccount.discord_username = discord_username;
      await userAccount.save();
      log(`Updated existing account for @${discord_username} with user NWC URI`, "info");
    } else {
      const newAccount = new AccountModel({
        discord_id,
        discord_username,
        nwc_uri: encryptData(nwc_uri, SALT),
        bot_nwc_uri: ""
      });
      await newAccount.save();
      log(`Created new account for @${discord_username} with user NWC URI`, "info");
    }

    accountsCache.delete(`account:${discord_id}`);

    return {
      success: true
    };
  } catch (err: any) {
    log(`Error connecting user account for @${discord_username}: ${err.message}`, "err");
    return {
      success: false,
      message: "❌ **Error saving your account connection.**"
    };
  }
};

const getBotServiceAccount = async (): Promise<ServiceAccountResult> => {
  try {
    const BOT_TOKEN = requiredEnvVar("BOT_TOKEN");
    
    const cachedAccount = accountsCache.get(`account:bot-service`) as ServiceAccountResult;
    if (cachedAccount) return cachedAccount;

    log(`Getting bot service account`, "info");

    let botAccount = await (AccountModel as any).findOne({ discord_id: BOT_TOKEN });
    
    if (!botAccount) {
      log(`Bot service account not found, creating new one`, "info");
      
      const serviceWalletResult = await createServiceWallet(BOT_TOKEN, "NWC Zap Bot Service");
      
      if (!serviceWalletResult.success) {
        log(`Failed to create bot service wallet: ${serviceWalletResult.error}`, "err");
        return {
          success: false,
          message: `❌ **Failed to create bot service account:** ${serviceWalletResult.error}`
        };
      }
      
      botAccount = await (AccountModel as any).findOne({ discord_id: BOT_TOKEN });
      if (!botAccount) {
        return {
          success: false,
          message: "❌ **Bot service account creation failed**"
        };
      }
    }

    const botNwcUri = decryptData(botAccount.bot_nwc_uri, SALT);
    if (!botNwcUri) {
      return {
        success: false,
        message: "❌ **Bot service account NWC URI not found**"
      };
    }

    const validationResult = await validateAccount(botNwcUri, "Bot-Service");
    if (!validationResult.success) {
      return {
        success: false,
        message: `❌ **Bot service account validation failed:** ${validationResult.message}`
      };
    }

    const createdAccount: ServiceAccountResult = {
      success: true,
      nwcClient: validationResult.nwcClient,
      balance: validationResult.balance,
      isServiceAccount: true,
      accountInfo: {
        type: 'bot-service',
        purpose: 'faucet_management_and_commissions',
        balance: validationResult.balance
      }
    };

    accountsCache.set(`account:bot-service`, createdAccount, 7200000);
    log(`Bot service account validated successfully - Balance: ${validationResult.balance} sats`, "info");
    
    return createdAccount;
  } catch (err: any) {
    log(`Error getting bot service account: ${err.message}`, "err");
    return {
      success: false,
      message: "❌ **Unexpected error getting the bot service account.**"
    };
  }
};

const validateAccount = async (nwcUri: string, username?: string): Promise<AccountResult> => {
  try {
    const formatValidation = validateNWCURI(nwcUri);
    if (!formatValidation.valid) {
      log(`${username ? `@${username} - ` : ''}Invalid NWC URI: ${formatValidation.error}`, "err");
      return {
        success: false,
        message: `❌ **Invalid connection URI:** ${formatValidation.error}`
      };
    }

    const connectionTest = await testNWCConnection(nwcUri);
    if (!connectionTest.valid) {
      log(`${username ? `@${username} - ` : ''}NWC connection error: ${connectionTest.error}`, "err");
      return {
        success: false,
        message: `❌ **Connection error:** ${connectionTest.error}`
      };
    }

    const nwcClient = new NWCClient({
      nostrWalletConnectUrl: nwcUri
    });

    log(`${username ? `@${username} - ` : ''}NWC connection validated successfully`, "info");

    return {
      success: true,
      nwcClient,
      balance: connectionTest.balance
    };
  } catch (err: any) {
    log(`${username ? `@${username} - ` : ''}Unexpected error validating account: ${err.message}`, "err");
    return {
      success: false,
      message: "❌ **Unexpected error validating the connection.**"
    };
  }
};

const getAccount = async (interaction: Interaction, discord_id: string): Promise<AccountResult> => {
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
      log(`@${userData.user.username} doesn't have a registered account, creating bot service wallet`, "info");
      
      const serviceWalletResult = await createServiceWallet(discord_id, userData.user.username);
      if (serviceWalletResult.success) {
        return await getAccount(interaction, discord_id);
      }
    }

    if (userAccount.nwc_uri) {
      const nwcUri = decryptData(userAccount.nwc_uri, SALT);
      if (nwcUri) {
        const validationResult = await validateAccount(nwcUri, userData.user.username);
        if (validationResult.success) {
          const createdAccount: AccountResult = {
            success: true,
            nwcClient: validationResult.nwcClient,
            balance: validationResult.balance,
            userAccount: userAccount as Account,
            isServiceAccount: false
          };

          accountsCache.set(`account:${discord_id}`, createdAccount, 7200000);
          return createdAccount;
        }
      }
    }

    if (userAccount.bot_nwc_uri) {
      const botNwcUri = decryptData(userAccount.bot_nwc_uri, SALT);
      if (botNwcUri) {
        const validationResult = await validateAccount(botNwcUri, userData.user.username);
        if (validationResult.success) {
          log(`@${userData.user.username} - using bot service account`, "info");
          
          const createdAccount: AccountResult = {
            success: true,
            nwcClient: validationResult.nwcClient,
            balance: validationResult.balance,
            userAccount: userAccount as Account,
            isServiceAccount: true
          };

          accountsCache.set(`account:${discord_id}`, createdAccount, 7200000);
          return createdAccount;
        }
      }
    }

    if (interaction.user!.id === discord_id) {
      return {
        success: false,
        message: "❌ **Your account connection is not working.**\n\nPlease use the `/connect` command to reconnect your wallet or try again later."
      };
    } else {
      return {
        success: false,
        message: "❌ **The user you're trying to send to doesn't have a working account connection.**\n\nThey need to reconnect their wallet or try again later."
      };
    }

  } catch (err: any) {
    log(`Unexpected error getting account: ${err.message}`, "err");
    return {
      success: false,
      message: "❌ **Unexpected error getting your account.**\n\nUse the `/connect` command to reconnect your wallet."
    }
  }
};

const createServiceWallet = async (discord_id: string, discord_username: string): Promise<{ success: boolean; walletId?: string; error?: string }> => {
  try {
    const ALBYHUB_URL = requiredEnvVar("ALBYHUB_URL");
    const ALBYHUB_TOKEN = requiredEnvVar("ALBYHUB_TOKEN");

    const requestBody = {
      name: discord_username,
      pubkey: "",
      budgetRenewal: "monthly",
      maxAmount: 1000000,
      scopes: [
        "pay_invoice",
        "get_balance",
        "make_invoice",
        "lookup_invoice",
        "list_transactions",
        "notifications"
      ],
      returnTo: "",
      isolated: true
    };

    log(`Creating service wallet for @${discord_username} via Alby Hub API`, "info");

    const response = await fetch(`${ALBYHUB_URL}/api/apps`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ALBYHUB_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      log(`Alby Hub API error for @${discord_username}: ${response.status} - ${errorText}`, "err");
      return {
        success: false,
        error: `Alby Hub API error: ${response.status} - ${errorText}`
      };
    }

    const responseData = await response.json();
    
    if (responseData.id && responseData.pairingUri) {
      log(`Service wallet created successfully for @${discord_username} with ID: ${responseData.id}`, "info");
      
      let userAccount = await (AccountModel as any).findOne({ discord_id });
      
      if (userAccount) {
        userAccount.bot_nwc_uri = encryptData(responseData.pairingUri, SALT);
        userAccount.discord_username = discord_username;
        await userAccount.save();
        log(`Updated existing account for @${discord_username} with bot NWC URI`, "info");
      } else {
        userAccount = new AccountModel({
          discord_id,
          discord_username,
          nwc_uri: "",
          bot_nwc_uri: encryptData(responseData.pairingUri, SALT)
        });
        await userAccount.save();
        log(`Created new account for @${discord_username} with bot NWC URI`, "info");
      }
      
      accountsCache.delete(`account:${discord_id}`);
      
      return {
        success: true,
        walletId: responseData.id.toString()
      };
    } else {
      log(`Unexpected response format from Alby Hub for @${discord_username}`, "err");
      return {
        success: false,
        error: "Unexpected response format from Alby Hub"
      };
    }

  } catch (err: any) {
    log(`Error creating service wallet for @${discord_username}: ${err.message}`, "err");
    return {
      success: false,
      error: `Network error: ${err.message}`
    };
  }
};

const initializeBotAccount = async (): Promise<{ success: boolean; message?: string; balance?: number }> => {
  try {
    log(`Initializing bot service account...`, "info");
    
    const botServiceResult = await getBotServiceAccount();
    if (botServiceResult.success) {
      log(`✅ Bot service account initialized successfully - Balance: ${botServiceResult.balance} sats`, "done");
      return {
        success: true,
        balance: botServiceResult.balance
      };
    } else {
      log(`❌ Bot service account failed: ${botServiceResult.message}`, "err");
      
      const BOT_TOKEN = requiredEnvVar("BOT_TOKEN");
      const existingBotAccount = await (AccountModel as any).findOne({ discord_id: BOT_TOKEN });
      
      if (existingBotAccount) {
        log(`Deleting existing failed bot account and creating new one...`, "info");
        
        await (AccountModel as any).deleteOne({ discord_id: BOT_TOKEN });
        accountsCache.delete(`account:bot-service`);
        
        const newServiceWalletResult = await createServiceWallet(BOT_TOKEN, "NWC Zap Bot Service");
        
        if (newServiceWalletResult.success) {
          log(`✅ New bot service account created successfully`, "done");
          
          const newBotServiceResult = await getBotServiceAccount();
          if (newBotServiceResult.success) {
            log(`✅ New bot service account initialized successfully - Balance: ${newBotServiceResult.balance} sats`, "done");
            return {
              success: true,
              balance: newBotServiceResult.balance
            };
          } else {
            log(`❌ New bot service account still failing: ${newBotServiceResult.message}`, "err");
            return {
              success: false,
              message: `❌ **Failed to initialize new bot service account:** ${newBotServiceResult.message}`
            };
          }
        } else {
          log(`❌ Failed to create new bot service wallet: ${newServiceWalletResult.error}`, "err");
          return {
            success: false,
            message: `❌ **Failed to create new bot service account:** ${newServiceWalletResult.error}`
          };
        }
      } else {
        return {
          success: false,
          message: botServiceResult.message
        };
      }
    }
  } catch (err: any) {
    log(`Error initializing bot account: ${err.message}`, "err");
    return {
      success: false,
      message: `Unexpected error: ${err.message}`
    };
  }
};

export { connectAccount, connectUserAccount, getBotServiceAccount, validateAccount, getAccount, createServiceWallet, initializeBotAccount };
