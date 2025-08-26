import { getAccount } from "../handlers/accounts.js";
import { log } from "../handlers/log.js";
import { validateAmountAndBalance, handleInvoicePayment } from "../utils/helperFunctions.js";
import { Interaction, User } from "discord.js";
import { ZapResult, BalanceValidationResult } from "../types/index.js";

const zap = async (
  interaction: Interaction,
  sender: User,
  receiver: User,
  amount: number,
  zapMessage: string
): Promise<ZapResult> => {
  try {
    if (amount <= 0)
      return { success: false, message: "Negative balances are not allowed" };

    const senderWallet = await getAccount(interaction, sender.id);

    const receiverWallet = await getAccount(
      interaction,
      receiver.id
    );
    
    if (!senderWallet.success) {
      return {
        success: false,
        message: senderWallet.message || "Unknown error"
      }
    };

    if (!receiverWallet.success) {
      return {
        success: false,
        message: receiverWallet.message || "Unknown error"
      }
    };

    if (senderWallet.userAccount?.discord_id === receiverWallet.userAccount?.discord_id)
      return {
        success: false,
        message: "You cannot send sats to yourself.",
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
      `@${sender.username} is going to pay the invoice ${invoiceDetails.invoice}`,
      "info"
    );

    const paymentResult = await handleInvoicePayment(
      senderWallet.nwcClient!,
      invoiceDetails.invoice,
      senderWallet.isServiceAccount || false,
      sender.username
    );

    if (!paymentResult.success) {
      throw new Error(paymentResult.error || "Error processing the payment");
    }

    return { success: true, message: "Payment completed successfully" };
  } catch (err: any) {
    log(
      `Error sending zap from @${sender.username} - Error code ${err.code} Message: ${err.message}`,
      "err"
    );

    return { success: false, message: "❌ **An error occurred while processing the payment.**\n\n**Please ensure you have allowed at least 10 sats for routing fees in your NWC connection, as this is often the cause of payment failures.**" };
  }
};

export { zap };
