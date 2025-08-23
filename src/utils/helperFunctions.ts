import SimpleCache from "../handlers/SimpleCache.js";
import { NWCClient } from "@getalby/sdk";
import bolt11, { PaymentRequestObject, TagsObject } from 'bolt11';
import { TextChannel, BaseInteraction } from "discord.js";
import { ValidationResult, ConnectionTestResult, BalanceValidationResult, BOLT11ValidationResult } from "../types/index.js";

export const signupCache = new SimpleCache();

export const validateNWCURI = (nwcUri: string): ValidationResult => {
  try {
    if (!nwcUri || typeof nwcUri !== 'string') {
      return { valid: false, error: 'The NWC URI cannot be empty' };
    }

    if (!nwcUri.startsWith('nostr+walletconnect://')) {
      return { valid: false, error: 'The URI must start with "nostr+walletconnect://"' };
    }

    const uriParts = nwcUri.replace('nostr+walletconnect://', '').split('?');
    if (uriParts.length !== 2) {
      return { valid: false, error: 'Invalid URI format' };
    }

    const [pubkey, params] = uriParts;
    
    if (!/^[0-9a-fA-F]{64}$/.test(pubkey)) {
      return { valid: false, error: 'Invalid public key' };
    }

    const searchParams = new URLSearchParams(params);
    const relay = searchParams.get('relay');
    const secret = searchParams.get('secret');

    if (!relay) {
      return { valid: false, error: 'Missing "relay" parameter' };
    }

    if (!secret) {
      return { valid: false, error: 'Missing "secret" parameter' };
    }

    try {
      new URL(relay);
    } catch {
      return { valid: false, error: 'Invalid relay URL' };
    }

    return { valid: true };
  } catch (error: any) {
    return { valid: false, error: 'Error validating the URI' };
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
      error: `Connection error: ${error.message}` 
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
      content: "You cannot use negative numbers or decimals",
    };

  if (amount > balance)
    return {
      status: false,
      content: `You don't have enough balance to perform this action. \nRequired: ${amount} - balance in your wallet: ${balance}`,
    };

  const routingFee = Math.ceil(balance * 0.005);
  const maxSendableAmount = Math.floor(balance - routingFee);
  
  if (amount > maxSendableAmount)
    return {
      status: false,
      content: `You cannot send more than ${maxSendableAmount} sats to reserve 0.5% (${routingFee} sats) for potential routing fees.`,
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
      return { valid: false, error: 'The BOLT11 cannot be empty' };
    }

    const decoded: PaymentRequestObject & { tagsObject: TagsObject } = bolt11.decode(bolt11String);
    
    if (!decoded) {
      return { valid: false, error: 'Could not decode the BOLT11' };
    }

    if (!decoded.satoshis && decoded.millisatoshis) {
      decoded.satoshis = Math.floor(Number(decoded.millisatoshis) / 1000);
    }

    if (!decoded.satoshis) {
      return { valid: false, error: 'The BOLT11 does not have a valid amount' };
    }

    return {
      valid: true,
      decoded,
      amount: decoded.satoshis,
      description: decoded.tagsObject?.description || 'No description',
      timestamp: decoded.timestamp,
      timeExpireDate: decoded.timeExpireDate
    };

  } catch (error: any) {
    return { 
      valid: false, 
      error: `Error decoding BOLT11: ${error.message}` 
    };
  }
};

export const isBOLT11Expired = (decodedBOLT11: BOLT11ValidationResult['decoded']): boolean => {
  if (!decodedBOLT11?.timestamp || !decodedBOLT11?.timeExpireDate) {
    return false;
  }

  const currentTime = Math.floor(Date.now() / 1000);
  const expiryTime = decodedBOLT11.timestamp + decodedBOLT11.timeExpireDate;
  
  return currentTime > expiryTime;
};

// Función para formatear mensajes de balance con el estilo del bot
const formatBalanceMessage = (balance: number, additionalInfo?: string): any => {
  const formattedBalance = balance.toLocaleString();
  
  const embed = {
    color: 0x2f3136, // Color gris oscuro como en la imagen
    description: `🔧 **Your Account Information**\n\n**Balance**\n**${formattedBalance} satoshis**${additionalInfo ? `\n\n${additionalInfo}` : ''}`,
  };
  
  return { embeds: [embed] };
};

// Función para formatear mensajes de error con el estilo del bot
const formatErrorMessage = (title: string, content: string): any => {
  const embed = {
    color: 0xed4245, // Color rojo para errores
    description: `❌ **${title}**\n\n${content}`,
  };
  
  return { embeds: [embed] };
};

// Función para formatear mensajes de éxito con el estilo del bot
const formatSuccessMessage = (title: string, content: string): any => {
  const embed = {
    color: 0x57f287, // Color verde para éxito
    description: `✅ **${title}**\n\n${content}`,
  };
  
  return { embeds: [embed] };
};

export {
  EphemeralMessageResponse,
  TimedMessage,
  FollowUpEphemeralResponse,
  handleBotResponse,
  validateAmountAndBalance,
  formatBalanceMessage,
  formatErrorMessage,
  formatSuccessMessage,
};
