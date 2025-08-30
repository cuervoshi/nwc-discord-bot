import { PrismaConfig } from "../utils/prisma.js";
import { encryptData, decryptData } from "../utils/crypto.js";
import { NWCClient } from "@getalby/sdk";
import { log } from "./log.js";
import { validateNWCURI, testNWCConnection, requiredEnvVar, getApplicationIdFromAPI } from "../utils/helperFunctions.js";
import { handleInvoicePayment } from "./payments.js";
import redisCache from "./RedisCache.js";
import { Interaction } from "discord.js";
import type { Account } from "../types/prisma.js";
import { AccountResult, ServiceAccountResult } from "../types/index.js";
import { BOT_CONFIG } from "#utils/config";
import { AuthorConfig } from "#utils/helperConfig";

const accountsCache = redisCache;
const SALT: string = process.env.SALT ?? "";
let botApplicationId: string | null = null;

const getBotApplicationId = async (): Promise<string> => {
  if (botApplicationId) {
    return botApplicationId;
  }

  const BOT_TOKEN = requiredEnvVar("BOT_TOKEN");
  const appId = await getApplicationIdFromAPI(BOT_TOKEN);

  if (!appId) {
    throw new Error("Failed to get bot application ID from Discord API");
  }

  botApplicationId = appId;
  log(`Bot Application ID obtained: ${appId}`, "info");
  return appId;
};

const connectAccount = async (discord_id: string, discord_username: string, nwc_uri: string): Promise<Account | null> => {
  try {
    const prisma = PrismaConfig.getClient();

    const existingAccount = await prisma.account.findUnique({
      where: { discord_id }
    });

    if (existingAccount) {
      await accountsCache.delete(`account:${discord_id}`);

      const updatedAccount = await prisma.account.update({
        where: { discord_id },
        data: {
          nwc_uri: encryptData(nwc_uri, SALT),
        }
      });

      return updatedAccount;
    }

    const newAccount = await prisma.account.create({
      data: {
        discord_id,
        discord_username,
        nwc_uri: encryptData(nwc_uri, SALT),
      }
    });

    return newAccount;
  } catch (err: any) {
    console.log(err);
    return null;
  }
};

const getBotServiceAccount = async (): Promise<ServiceAccountResult> => {
  try {
    const botAppId = await getBotApplicationId();

    const cachedAccount = await accountsCache.get(`account:bot-service`) as ServiceAccountResult;
    if (cachedAccount && cachedAccount.success && cachedAccount.encryptedNwcUri) {
      try {
        const botNwcUri = decryptData(cachedAccount.encryptedNwcUri, SALT);
        if (botNwcUri) {
          const nwcClient = new NWCClient({ nostrWalletConnectUrl: botNwcUri });
          cachedAccount.nwcClient = nwcClient;

          try {
            const currentBalance = await nwcClient.getBalance();
            const updatedBalance = Number(currentBalance.balance.toString()) / 1000;
            cachedAccount.balance = updatedBalance;
            log(`Bot service account balance updated from cache: ${updatedBalance} sats`, "info");
            return cachedAccount;
          } catch (balanceError: any) {
            log(`Error updating bot service account balance from cache: ${balanceError.message}`, "warn");
            await accountsCache.delete(`account:bot-service`);
            log(`Bot service account cache invalidated due to balance update failure`, "info");
          }
        }
      } catch (decryptError: any) {
        log(`Error decrypting cached NWC URI: ${decryptError.message}`, "warn");
        // Invalidar el cache si falla el descifrado
        await accountsCache.delete(`account:bot-service`);
        log(`Bot service account cache invalidated due to decryption failure`, "info");
      }
    }

    log(`Getting bot service account`, "info");

    const prisma = PrismaConfig.getClient();
    let botAccount = await prisma.account.findUnique({
      where: { discord_id: botAppId }
    });

    if (!botAccount) {
      log(`Bot service account not found, creating new one`, "info");

      const serviceWalletResult = await createServiceWallet(botAppId, AuthorConfig.name);

      if (!serviceWalletResult.success) {
        log(`Failed to create bot service wallet: ${serviceWalletResult.error}`, "err");
        return {
          success: false,
          message: `❌ **Failed to create bot service account:** ${serviceWalletResult.error}`
        };
      }

      if (serviceWalletResult.account) {
        botAccount = serviceWalletResult.account;
        log(`Bot service wallet created successfully, using returned account`, "info");
      } else {
        log(`Bot service wallet created but no account returned`, "err");
        return {
          success: false,
          message: "❌ **Bot service account creation failed - no account returned**"
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

    const validationResult = await validateAccount(botNwcUri, AuthorConfig.name);
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
      encryptedNwcUri: botAccount.bot_nwc_uri,
      accountInfo: {
        type: 'bot-service',
        purpose: 'faucet_management_and_commissions',
        balance: validationResult.balance
      }
    };

    await accountsCache.set(`account:bot-service`, createdAccount, 7200000);
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

const getAccountInternal = async (discord_id: string, username: string, isCurrentUser: boolean = false): Promise<AccountResult> => {
  try {
    const cachedAccount = await accountsCache.get(`account:${discord_id}`) as AccountResult;
    if (cachedAccount && cachedAccount.success) {
      try {
        log(`@${username} - using cached account, updating balance`, "info");

        // Recreate the NWC client since it loses its methods when serialized
        if (cachedAccount.userAccount) {
          if (cachedAccount.isServiceAccount && cachedAccount.userAccount.bot_nwc_uri) {
            const botNwcUri = decryptData(cachedAccount.userAccount.bot_nwc_uri, SALT);
            if (botNwcUri) {
              const nwcClient = new NWCClient({ nostrWalletConnectUrl: botNwcUri });
              cachedAccount.nwcClient = nwcClient;
            }
          } else if (!cachedAccount.isServiceAccount && cachedAccount.userAccount.nwc_uri) {
            const nwcUri = decryptData(cachedAccount.userAccount.nwc_uri, SALT);
            if (nwcUri) {
              const nwcClient = new NWCClient({ nostrWalletConnectUrl: nwcUri });
              cachedAccount.nwcClient = nwcClient;
            }
          }
        }

        if (cachedAccount.nwcClient && typeof cachedAccount.nwcClient.getBalance === 'function') {
          try {
            const currentBalance = await cachedAccount.nwcClient.getBalance();
            const updatedBalance = Number(currentBalance.balance.toString()) / 1000;

            cachedAccount.balance = updatedBalance;

            log(`@${username} - balance updated: ${updatedBalance} sats`, "info");

            return cachedAccount;
          } catch (balanceError: any) {
            log(`@${username} - error updating cached balance: ${balanceError.message}`, "err");
            await accountsCache.delete(`account:${discord_id}`);
            log(`@${username} - account cache invalidated due to balance update failure`, "info");
          }
        } else {
          log(`@${username} - cached nwcClient is invalid, will recreate account`, "warn");
          await accountsCache.delete(`account:${discord_id}`);
        }
      } catch (balanceError: any) {
        log(`@${username} - error updating cached balance: ${balanceError.message}`, "err");
        await accountsCache.delete(`account:${discord_id}`);
      }
    }

    const prisma = PrismaConfig.getClient();
    const userAccount = await prisma.account.findUnique({
      where: { discord_id }
    });

    if (!userAccount) {
      log(`@${username} doesn't have a registered account, creating bot service wallet`, "info");

      const serviceWalletResult = await createServiceWallet(discord_id, username);
      if (serviceWalletResult.success && serviceWalletResult.account) {
        const userAccount = serviceWalletResult.account;

        if (userAccount.bot_nwc_uri) {
          const botNwcUri = decryptData(userAccount.bot_nwc_uri, SALT);
          if (botNwcUri) {
            const validationResult = await validateAccount(botNwcUri, username);
            if (validationResult.success) {
              log(`@${username} - using newly created bot service account`, "info");

              const createdAccount: AccountResult = {
                success: true,
                nwcClient: validationResult.nwcClient,
                balance: validationResult.balance,
                userAccount: userAccount,
                isServiceAccount: true
              };

              await accountsCache.set(`account:${discord_id}`, createdAccount, 7200000);
              return createdAccount;
            }
          }
        }

        log(`@${username} - newly created service account validation failed`, "err");
        return {
          success: false,
          message: "❌ **Unable to validate newly created account.**\n\nPlease try again later or contact support."
        };
      } else {
        log(`@${username} - failed to create bot service wallet, cannot provide account`, "err");
        return {
          success: false,
          message: "❌ **Unable to create account.**\n\nPlease try again later or contact support."
        };
      }
    }

    if (userAccount.nwc_uri) {
      const nwcUri = decryptData(userAccount.nwc_uri, SALT);
      if (nwcUri) {
        const validationResult = await validateAccount(nwcUri, username);
        if (validationResult.success) {
          const createdAccount: AccountResult = {
            success: true,
            nwcClient: validationResult.nwcClient,
            balance: validationResult.balance,
            userAccount: userAccount,
            isServiceAccount: false
          };

          await accountsCache.set(`account:${discord_id}`, createdAccount, 7200000);
          return createdAccount;
        } else {
          log(`@${username} - user NWC connection failed, falling back to bot service account`, "info");
        }
      }
    }

    // Check if user has a bot service account
    if (userAccount.bot_nwc_uri) {
      const botNwcUri = decryptData(userAccount.bot_nwc_uri, SALT);
      if (botNwcUri) {
        const validationResult = await validateAccount(botNwcUri, username);
        if (validationResult.success) {
          log(`@${username} - using existing bot service account`, "info");

          const createdAccount: AccountResult = {
            success: true,
            nwcClient: validationResult.nwcClient,
            balance: validationResult.balance,
            userAccount: userAccount,
            isServiceAccount: true
          };

          await accountsCache.set(`account:${discord_id}`, createdAccount, 7200000);
          return createdAccount;
        } else {
          log(`@${username} - existing bot service account validation failed`, "err");
          // Don't create a new account, inform the user about the connection issue
          if (isCurrentUser) {
            return {
              success: false,
              message: "❌ **Your bot service account connection is not working.**\n\nPlease use the `/create-wallet` command to regenerate your bot service account or try again later."
            };
          } else {
            return {
              success: false,
              message: "❌ **The user you're trying to send to doesn't have a working account connection.**\n\nThey need to use the `/create-wallet` command to regenerate their account."
            };
          }
        }
      }
    }

    // User doesn't have a bot service account, create one only if they don't have any account
    if (!userAccount.nwc_uri && !userAccount.bot_nwc_uri) {
      log(`@${username} - no accounts found, creating bot service wallet`, "info");

      const serviceWalletResult = await createServiceWallet(discord_id, username);
      if (serviceWalletResult.success && serviceWalletResult.account) {
        const userAccount = serviceWalletResult.account;

        if (userAccount.bot_nwc_uri) {
          const botNwcUri = decryptData(userAccount.bot_nwc_uri, SALT);
          if (botNwcUri) {
            const validationResult = await validateAccount(botNwcUri, username);
            if (validationResult.success) {
              log(`@${username} - using newly created bot service account`, "info");

              const createdAccount: AccountResult = {
                success: true,
                nwcClient: validationResult.nwcClient,
                balance: validationResult.balance,
                userAccount: userAccount,
                isServiceAccount: true
              };

              await accountsCache.set(`account:${discord_id}`, createdAccount, 7200000);
              return createdAccount;
            }
          }
        }

        log(`@${username} - newly created service account validation failed`, "err");
        return {
          success: false,
          message: "❌ **Unable to validate newly created account.**\n\nPlease try again later or contact support."
        };
      } else {
        log(`@${username} - failed to create bot service wallet`, "err");
        return {
          success: false,
          message: "❌ **Unable to create account.**\n\nPlease try again later or contact support."
        };
      }
    }

    // If we reach here, user has an account but both connections failed
    log(`@${username} - all account connections failed`, "err");
    if (isCurrentUser) {
      return {
        success: false,
        message: "❌ **Your account connections are not working.**\n\nPlease use the `/connect` command to reconnect your wallet or `/create-wallet` to regenerate your bot service account."
      };
    } else {
      return {
        success: false,
        message: "❌ **The user you're trying to send to doesn't have a working account connection.**\n\nThey need to reconnect their wallet or regenerate their bot service account."
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

const getAccount = async (interaction: Interaction, discord_id: string): Promise<AccountResult> => {
  try {
    const isCurrentUser = interaction.user!.id === discord_id;
    let username: string;

    if (isCurrentUser) {
      username = interaction.user!.username;
    } else {
      if (interaction.guild) {
        try {
          const userData = await interaction.guild.members.fetch(discord_id);
          username = userData.user.username;
        } catch (guildErr: any) {
          log(`Error fetching user from guild for ${discord_id}: ${guildErr.message}`, "err");
          return {
            success: false,
            message: "❌ **Error fetching user data.**\n\nPlease try again later."
          };
        }
      } else {
        log(`Cannot fetch user data for ${discord_id} in DM context`, "err");
        return {
          success: false,
          message: "❌ **Cannot fetch user data in DM.**\n\nThis command requires guild context to fetch other users."
        };
      }
    }

    return await getAccountInternal(discord_id, username, isCurrentUser);
  } catch (err: any) {
    log(`Error fetching user data for ${discord_id}: ${err.message}`, "err");
    return {
      success: false,
      message: "❌ **Error fetching user data.**\n\nPlease try again later."
    };
  }
};

const createServiceWallet = async (discord_id: string, discord_username: string): Promise<{ success: boolean; walletId?: string; error?: string; account?: Account }> => {
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

      const prisma = PrismaConfig.getClient();
      let userAccount = await prisma.account.findUnique({
        where: { discord_id }
      });

      if (userAccount) {
        userAccount = await prisma.account.update({
          where: { discord_id },
          data: {
            bot_nwc_uri: encryptData(responseData.pairingUri, SALT),
            discord_username: discord_username,
          }
        });
        log(`Updated existing account for @${discord_username} with bot NWC URI`, "info");
      } else {
        userAccount = await prisma.account.create({
          data: {
            discord_id,
            discord_username,
            nwc_uri: "",
            bot_nwc_uri: encryptData(responseData.pairingUri, SALT)
          }
        });
        log(`Created new account for @${discord_username} with bot NWC URI`, "info");
      }

      await accountsCache.delete(`account:${discord_id}`);

      return {
        success: true,
        walletId: responseData.id.toString(),
        account: userAccount
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

      const botAppId = await getBotApplicationId();
      const prisma = PrismaConfig.getClient();
      const existingBotAccount = await prisma.account.findUnique({
        where: { discord_id: botAppId }
      });

      if (existingBotAccount) {
        log(`Replacing existing failed bot account with new one...`, "info");

        await accountsCache.delete(`account:bot-service`);

        const newServiceWalletResult = await createServiceWallet(botAppId, AuthorConfig.name);

        if (newServiceWalletResult.success && newServiceWalletResult.account) {
          log(`✅ New bot service account created successfully`, "done");

          const botAccount = newServiceWalletResult.account;
          const botNwcUri = decryptData(botAccount.bot_nwc_uri, SALT);

          if (botNwcUri) {
            const validationResult = await validateAccount(botNwcUri, AuthorConfig.name);
            if (validationResult.success) {
              log(`✅ New bot service account initialized successfully - Balance: ${validationResult.balance} sats`, "done");
              return {
                success: true,
                balance: validationResult.balance
              };
            } else {
              log(`❌ New bot service account validation failed: ${validationResult.message}`, "err");
              return {
                success: false,
                message: `❌ **Failed to validate new bot service account:** ${validationResult.message}`
              };
            }
          } else {
            log(`❌ New bot service account NWC URI not found`, "err");
            return {
              success: false,
              message: "❌ **Failed to initialize new bot service account:** NWC URI not found"
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

const checkBotAccountFunds = async (discord_id: string): Promise<{ hasFunds: boolean; balance?: number; error?: string }> => {
  try {
    const prisma = PrismaConfig.getClient();
    const userAccount = await prisma.account.findUnique({
      where: { discord_id }
    });

    if (!userAccount || !userAccount.bot_nwc_uri) {
      return { hasFunds: false };
    }

    const botNwcUri = decryptData(userAccount.bot_nwc_uri, SALT);
    if (!botNwcUri) {
      return { hasFunds: false };
    }

    const validationResult = await validateAccount(botNwcUri, "Bot-Account-Check");
    if (!validationResult.success) {
      return { hasFunds: false };
    }

    const routingFee = Math.ceil(validationResult.balance * BOT_CONFIG.ROUTING_FEE_PERCENTAGE);
    const totalReserve = Math.max(routingFee, 1);
    const balance = Math.floor(validationResult.balance - totalReserve);

    return {
      hasFunds: balance > 1,
      balance: balance
    };
  } catch (err: any) {
    log(`Error checking bot account funds for user ${discord_id}: ${err.message}`, "err");
    return { hasFunds: false, error: err.message };
  }
};

const transferBotFundsToUser = async (discord_id: string): Promise<{ success: boolean; message?: string; transferredAmount?: number }> => {
  try {
    const prisma = PrismaConfig.getClient();
    const userAccount = await prisma.account.findUnique({
      where: { discord_id }
    });

    if (!userAccount || !userAccount.bot_nwc_uri) {
      return {
        success: false,
        message: "❌ **No bot account found to transfer funds from.**"
      };
    }

    if (!userAccount.nwc_uri) {
      return {
        success: false,
        message: "❌ **You need to connect your own wallet first using `/connect` to recover funds.**"
      };
    }

    const userNwcUri = decryptData(userAccount.nwc_uri, SALT);
    if (!userNwcUri) {
      return {
        success: false,
        message: "❌ **User wallet URI not found.**"
      };
    }

    const userValidationResult = await validateAccount(userNwcUri, "User-Transfer");
    if (!userValidationResult.success) {
      return {
        success: false,
        message: `❌ **User wallet validation failed:** ${userValidationResult.message}`
      };
    }

    const botNwcUri = decryptData(userAccount.bot_nwc_uri, SALT);
    if (!botNwcUri) {
      return {
        success: false,
        message: "❌ **Bot account URI not found.**"
      };
    }

    const botValidationResult = await validateAccount(botNwcUri, "Bot-Transfer");
    if (!botValidationResult.success) {
      return {
        success: false,
        message: `❌ **Bot account validation failed:** ${botValidationResult.message}`
      };
    }

    const routingFee = Math.ceil(botValidationResult.balance * BOT_CONFIG.ROUTING_FEE_PERCENTAGE);
    const totalReserve = Math.max(routingFee, BOT_CONFIG.MIN_ROUTING_FEE_RESERVE);
    const botBalance = Math.floor(botValidationResult.balance - totalReserve);
    if (botBalance <= 1) {
      return {
        success: false,
        message: "❌ **No funds available to transfer from bot account.**"
      };
    }

    const invoiceResponse = await userValidationResult.nwcClient.makeInvoice({
      amount: botBalance * 1000,
      description: "Transfer from bot account"
    });

    if (!invoiceResponse || !invoiceResponse.invoice) {
      return {
        success: false,
        message: "❌ **Failed to create invoice in your wallet.**"
      };
    }

    const botNwcClient = new NWCClient({ nostrWalletConnectUrl: botNwcUri });
    const paymentResult = await handleInvoicePayment(
      botNwcClient,
      invoiceResponse.invoice,
      true,
      userAccount.discord_username
    );

    if (!paymentResult.success) {
      return {
        success: false,
        message: `❌ **Failed to transfer funds from bot account:** ${paymentResult.error}`
      };
    }

    log(`Successfully transferred ${botBalance} sats from bot account to user ${discord_id}`, "info");

    return {
      success: true,
      transferredAmount: botBalance,
      message: `✅ **Successfully transferred ${botBalance} sats from your bot account to your connected wallet!**`
    };

  } catch (err: any) {
    log(`Error transferring bot funds for user ${discord_id}: ${err.message}`, "err");
    return {
      success: false,
      message: `❌ **Transfer failed:** ${err.message}`
    };
  }
};

const disconnectAccount = async (discord_id: string): Promise<{ success: boolean; message?: string }> => {
  try {
    const prisma = PrismaConfig.getClient();
    const userAccount = await prisma.account.findUnique({
      where: { discord_id }
    });

    if (!userAccount) {
      return {
        success: false,
        message: "❌ **No account found to disconnect.**"
      };
    }

    if (!userAccount.nwc_uri || userAccount.nwc_uri.trim() === "") {
      return {
        success: false,
        message: "❌ **You don't have a connected wallet to disconnect.**\n\nYou can use `/connect` to connect a wallet first."
      };
    }

    // Remove user's NWC connection from database
    await prisma.account.update({
      where: { discord_id },
      data: { nwc_uri: "" }
    });

    // Clear account from cache
    await accountsCache.delete(`account:${discord_id}`);

    log(`Successfully disconnected NWC account for user ${discord_id}`, "info");

    return {
      success: true,
      message: "✅ **Your wallet has been disconnected successfully.**\n\nYou can now use `/connect` to connect a new wallet, or the bot will use your service account for transactions."
    };

  } catch (err: any) {
    log(`Error disconnecting account for user ${discord_id}: ${err.message}`, "err");
    return {
      success: false,
      message: `❌ **Failed to disconnect account:** ${err.message}`
    };
  }
};

const getAccountByUsername = async (username: string): Promise<AccountResult> => {
  try {
    const prisma = PrismaConfig.getClient();
    const userAccount = await prisma.account.findFirst({
      where: { discord_username: username }
    });

    if (!userAccount) {
      return {
        success: false,
        message: "User not found"
      };
    }

    return await getAccountInternal(userAccount.discord_id, username, false);

  } catch (err: any) {
    log(`Error getting account by username ${username}: ${err.message}`, "err");
    return {
      success: false,
      message: `Error retrieving account: ${err.message}`
    };
  }
};

export { connectAccount, getBotServiceAccount, validateAccount, getAccount, getAccountInternal, createServiceWallet, initializeBotAccount, checkBotAccountFunds, transferBotFundsToUser, disconnectAccount, getAccountByUsername };
