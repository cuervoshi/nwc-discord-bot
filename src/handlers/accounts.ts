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

    log(`Obteniendo cuenta de servicio para faucets`, "info");

    const formatValidation = validateNWCURI(SERVICE_NWC_URI);
    if (!formatValidation.valid) {
      log(`NWC URI de servicio inválido: ${formatValidation.error}`, "err");
      return {
        success: false,
        message: `❌ **Error en configuración de servicio:** ${formatValidation.error}`
      };
    }

    const connectionTest = await testNWCConnection(SERVICE_NWC_URI);
    if (!connectionTest.valid) {
      log(`Error de conexión NWC de servicio: ${connectionTest.error}`, "err");
      return {
        success: false,
        message: `❌ **Error de conexión de servicio:** ${connectionTest.error}`
      };
    }

    const nwcClient = new NWCClient({
      nostrWalletConnectUrl: SERVICE_NWC_URI
    });

    log(`Cuenta de servicio validada exitosamente - Balance: ${connectionTest.balance} sats`, "info");

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
    log(`Error obteniendo cuenta de servicio: ${err.message}`, "err");
    return {
      success: false,
      message: "❌ **Error inesperado al obtener la cuenta de servicio.**"
    };
  }
};

const getAndValidateAccount = async (interaction: Interaction, discord_id: string): Promise<AccountResult> => {
  try {
    const userData = await interaction.guild!.members.fetch(discord_id);

    const cachedAccount = accountsCache.get(`account:${discord_id}`) as AccountResult;
    if (cachedAccount && cachedAccount.success) {
      try {
        log(`@${userData.user.username} - usando cuenta cacheada, actualizando balance`, "info");
        
        const currentBalance = await cachedAccount.nwcClient!.getBalance();
        const updatedBalance = Number(currentBalance.balance.toString()) / 1000;
        
        cachedAccount.balance = updatedBalance;
        
        log(`@${userData.user.username} - balance actualizado: ${updatedBalance} sats`, "info");
        
        return cachedAccount;
      } catch (balanceError: any) {
        log(`@${userData.user.username} - error al actualizar balance cacheado: ${balanceError.message}`, "err");
      }
    }
    
    const userAccount = await (AccountModel as any).findOne({ discord_id });
    if (!userAccount) {
      log(`@${userData.user.username} no tiene cuenta registrada`, "err");

      if (interaction.user!.id === discord_id) {
        return {
          success: false,
          message: "❌ **No tienes una cuenta registrada.**\n\nUsa el comando `/connect` para conectar tu billetera NWC."
        }
      } else {
        return {
          success: false,
          message: "❌ **El usuario al que intentas enviar no tiene una cuenta registrada.**"
        }
      }
    }

    const nwcUri = decryptData(userAccount.nwc_uri, SALT);
    if (!nwcUri) {
      log(`@${userData.user.username} - Error al desencriptar NWC URI`, "err");

      if (interaction.user!.id === discord_id) {
        return {
          success: false,
          message: "❌ **Error al recuperar tu conexión NWC.**\n\nUsa el comando `/connect` para reconectar tu billetera."
        }
      } else {
        return {
          success: false,
          message: "❌ **Error al recuperar la conexión NWC del usuario.**"
        }
      }
    }

    const formatValidation = validateNWCURI(nwcUri);
    if (!formatValidation.valid) {
      log(`@${userData.user.username} - NWC URI inválido: ${formatValidation.error}`, "err");

      if (interaction.user!.id === discord_id) {
        return {
          success: false,
          message: `❌ **URI de conexión inválido:** ${formatValidation.error}\n\nUsa el comando \`/connect\` para reconectar tu billetera.`
        }
      } else {
        return {
          success: false,
          message: `❌ **El URI de conexión del usuario al que intentas enviar es inválido.**`
        }
      }
    }

    const connectionTest = await testNWCConnection(nwcUri);
    if (!connectionTest.valid) {
      log(`@${userData.user.username} - Error de conexión NWC: ${connectionTest.error}`, "err");

      return {
        success: false,
        message: `❌ **Error de conexión:** ${connectionTest.error}\n\nVerifica que tu billetera o la del usuario al que intentas enviar esté correctamente conectada. Usa \`/connect\` para reconectar si es necesario.`
      }
    }

    const nwcClient = new NWCClient({
      nostrWalletConnectUrl: nwcUri
    });

    log(`@${userData.user.username} - Conexión NWC validada exitosamente`, "info");

    const createdAccount: AccountResult = {
      success: true,
      nwcClient,
      balance: connectionTest.balance,
      userAccount: userAccount as Account
    };

    accountsCache.set(`account:${discord_id}`, createdAccount, 7200000);
    return createdAccount;
  } catch (err: any) {
    log(`Error inesperado al validar cuenta: ${err.message}`, "err");
    return {
      success: false,
      message: "❌ **Error inesperado al validar tu cuenta.**\n\nUsa el comando `/connect` para reconectar tu billetera."
    }
  }
};

export { createOrUpdateAccount, getAndValidateAccount, getServiceAccount };
