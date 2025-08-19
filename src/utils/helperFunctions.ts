import NDK, { NDKEvent, NDKRelaySet } from "@nostr-dev-kit/ndk";
import { log } from "../handlers/log.js";
import SimpleCache from "../handlers/SimpleCache.js";
import { NWCClient } from "@getalby/sdk";
import bolt11 from 'bolt11';
import { Interaction, TextChannel, BaseInteraction } from "discord.js";

interface ValidationResult {
  valid: boolean;
  error?: string;
}

interface ConnectionTestResult {
  valid: boolean;
  balance?: number;
  error?: string;
}

interface BalanceValidationResult {
  status: boolean;
  content: string;
}

interface BOLT11ValidationResult {
  valid: boolean;
  error?: string;
  decoded?: any;
  amount?: number;
  description?: string;
  timestamp?: number;
  expiry?: number;
}

export const signupCache = new SimpleCache();

export const validateNWCURI = (nwcUri: string): ValidationResult => {
  try {
    if (!nwcUri || typeof nwcUri !== 'string') {
      return { valid: false, error: 'El URI de NWC no puede estar vacío' };
    }

    if (!nwcUri.startsWith('nostr+walletconnect://')) {
      return { valid: false, error: 'El URI debe comenzar con "nostr+walletconnect://"' };
    }

    const uriParts = nwcUri.replace('nostr+walletconnect://', '').split('?');
    if (uriParts.length !== 2) {
      return { valid: false, error: 'Formato de URI inválido' };
    }

    const [pubkey, params] = uriParts;
    
    if (!/^[0-9a-fA-F]{64}$/.test(pubkey)) {
      return { valid: false, error: 'Clave pública inválida' };
    }

    const searchParams = new URLSearchParams(params);
    const relay = searchParams.get('relay');
    const secret = searchParams.get('secret');

    if (!relay) {
      return { valid: false, error: 'Falta el parámetro "relay"' };
    }

    if (!secret) {
      return { valid: false, error: 'Falta el parámetro "secret"' };
    }

    try {
      new URL(relay);
    } catch {
      return { valid: false, error: 'URL del relay inválida' };
    }

    return { valid: true };
  } catch (error: any) {
    return { valid: false, error: 'Error al validar el URI' };
  }
};

export const testNWCConnection = async (nwcUri: string): Promise<ConnectionTestResult> => {
  let nwc: NWCClient | null = null;
  try {
    nwc = new NWCClient({
      nostrWalletConnectUrl: nwcUri
    });

    const response = await nwc.getBalance();
    
    return { valid: true, balance: Number(response.balance.toString()) / 1000 };
  } catch (error: any) {
    return { 
      valid: false, 
      error: `Error de conexión: ${error.message}` 
    };
  }
};

export const requiredEnvVar = (key: string): string => {
  const envVar = process.env[key];
  if (undefined === envVar) {
    throw new Error(`Environment process ${key} must be defined`);
  }
  return envVar;
};

const validateAmountAndBalance = (amount: number, balance: number): BalanceValidationResult => {
  if (amount <= 0)
    return {
      status: false,
      content: "No puedes usar números negativos o flotantes",
    };

  if (amount > balance)
    return {
      status: false,
      content: `No tienes saldo suficiente para realizar esta acción. \nRequerido: ${amount} - balance en tu billetera: ${balance}`,
    };

  return {
    status: true,
    content: "",
  };
};

export const normalizeLNDomain = (domain: string): string => {
  try {
    const iURL = new URL(domain);
    return iURL.hostname;
  } catch {
    return "";
  }
};

const handleBotResponse = async (interaction: BaseInteraction, objConfig: any): Promise<void> => {
  if ('deferred' in interaction && interaction.deferred) {
    await (interaction as any).editReply(objConfig);
  } else {
    await (interaction as any).reply(objConfig);
  }
};

const EphemeralMessageResponse = async (interaction: BaseInteraction, content: string): Promise<void> => {
  const objectResponse = {
    content,
    ephemeral: true,
  };

  await handleBotResponse(interaction, objectResponse);
};

const TimedMessage = (message: string, channel: TextChannel, duration: number): void => {
  channel
    .send(message)
    .then((m) =>
      setTimeout(
        async () => {
          const fetchedMessage = await channel.messages.fetch(m);
          await fetchedMessage.delete();
        },
        duration
      )
    );
};

const FollowUpEphemeralResponse = async (interaction: BaseInteraction, content: string): Promise<any> => {
  await (interaction as any).deleteReply();

  return (interaction as any).followUp({
    content: content,
    ephemeral: true,
  });
};

export const validateAndDecodeBOLT11 = (bolt11String: string): BOLT11ValidationResult => {
  try {
    if (!bolt11String || typeof bolt11String !== 'string') {
      return { valid: false, error: 'El BOLT11 no puede estar vacío' };
    }

    const decoded = bolt11.decode(bolt11String);
    
    if (!decoded) {
      return { valid: false, error: 'No se pudo decodificar el BOLT11' };
    }

    if (!decoded.satoshis && (decoded as any).millisatoshis) {
      (decoded as any).satoshis = Math.floor((decoded as any).millisatoshis / 1000);
    }

    if (!decoded.satoshis) {
      return { valid: false, error: 'El BOLT11 no tiene un monto válido' };
    }

    return {
      valid: true,
      decoded,
      amount: decoded.satoshis,
      description: (decoded as any).description || 'Sin descripción',
      timestamp: (decoded as any).timestamp,
      expiry: (decoded as any).expiry
    };

  } catch (error: any) {
    return { 
      valid: false, 
      error: `Error al decodificar BOLT11: ${error.message}` 
    };
  }
};

export const isBOLT11Expired = (decodedBOLT11: any): boolean => {
  if (!decodedBOLT11.timestamp || !decodedBOLT11.expiry) {
    return false;
  }

  const currentTime = Math.floor(Date.now() / 1000);
  const expiryTime = decodedBOLT11.timestamp + decodedBOLT11.expiry;
  
  return currentTime > expiryTime;
};

export {
  EphemeralMessageResponse,
  TimedMessage,
  FollowUpEphemeralResponse,
  handleBotResponse,
  validateAmountAndBalance,
};
