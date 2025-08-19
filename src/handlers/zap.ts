import { getAndValidateAccount, getServiceAccount } from "../handlers/accounts.js";
import { log } from "../handlers/log.js";
import { validateAmountAndBalance } from "../utils/helperFunctions.js";
import { Interaction, User } from "discord.js";

interface ZapResult {
  success: boolean;
  message: string;
}

interface BalanceValidationResult {
  status: boolean;
  content: string;
}

const zap = async (
  interaction: Interaction,
  sender: User,
  receiver: User,
  amount: number,
  onSuccess: () => void,
  onError: () => void,
  zapMessage: string
): Promise<ZapResult> => {
  try {
    if (amount <= 0)
      return { success: false, message: "No se permiten saldos negativos" };

    const senderWallet = await getAndValidateAccount(interaction, sender.id);

    const receiverWallet = await getAndValidateAccount(
      interaction,
      receiver.id
    );

    //const receiverWallet = await getServiceAccount(interaction);

    if (!senderWallet.success) {
      return {
        success: false,
        message: senderWallet.message || "Error desconocido"
      }
    };

    if (!receiverWallet.success) {
      return {
        success: false,
        message: receiverWallet.message || "Error desconocido"
      }
    };

    if (senderWallet.userAccount?.discord_id === receiverWallet.userAccount?.discord_id)
      return {
        success: false,
        message: "No puedes enviarte sats a vos mismo.",
      };

    const senderBalance = senderWallet.balance || 0;
    const isValidAmount: BalanceValidationResult = validateAmountAndBalance(
      amount,
      senderBalance
    );

    if (!isValidAmount.status)
      return { success: false, message: isValidAmount.content };

    const invoiceDetails = await receiverWallet.nwcClient!.makeInvoice({ 
      amount: amount * 1000, 
      description: zapMessage 
    });

    log(
      `@${sender.username} va a pagar la factura ${invoiceDetails.invoice}`,
      "info"
    );

    const response = await senderWallet.nwcClient!.payInvoice({
      invoice: invoiceDetails.invoice,
    });

    if (!response) throw new Error("Error al realizar el pago");

    return { success: true, message: "Pago realizado con exito" };
  } catch (err: any) {
    log(
      `Error al enviar zap de @${sender.username} - Código de error ${err.code} Mensaje: ${err.message}`,
      "err"
    );

    return { success: false, message: "Ocurrió un error al realizar el pago" };
  }
};

export { zap };
