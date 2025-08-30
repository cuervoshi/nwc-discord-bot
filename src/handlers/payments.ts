import { NWCClient } from "@getalby/sdk";
import bolt11 from 'bolt11';
import { log } from "./log.js";
import { getBotServiceAccount } from "./accounts.js";

const attemptRefund = async (
  userNwcClient: NWCClient,
  botNwcClient: NWCClient,
  totalAmount: number,
  originalAmount: number
): Promise<{ success: boolean; error?: string }> => {
  try {
    log(`Creating refund invoice for ${totalAmount} sats`, "info");
    
    const refundInvoice = await userNwcClient.makeInvoice({
      amount: totalAmount * 1000,
      description: `Refund for failed proxy payment of ${originalAmount} sats`,
    });
    
    if (!refundInvoice || !refundInvoice.invoice) {
      log(`Failed to create refund invoice`, "err");
      return { 
        success: false, 
        error: "Failed to create refund invoice" 
      };
    }
    
    log(`Paying refund invoice: ${refundInvoice.invoice}`, "info");
    
    const refundPayment = await botNwcClient.payInvoice({
      invoice: refundInvoice.invoice,
    });
    
    if (!refundPayment || !refundPayment.preimage) {
      log(`Failed to pay refund invoice`, "err");
      return { 
        success: false, 
        error: "Failed to pay refund invoice" 
      };
    }
    
    log(`Refund payment successful with preimage: ${refundPayment.preimage}`, "info");
    return { success: true };
    
  } catch (error: any) {
    log(`Refund attempt failed: ${error.message}`, "err");
    return { 
      success: false, 
      error: error.message || "Unknown refund error" 
    };
  }
};

const validateTargetInvoice = (targetInvoice: string): { valid: boolean; amount?: number; error?: string } => {
  try {
    const decoded = bolt11.decode(targetInvoice);
    
    if (!decoded) {
      return { valid: false, error: "Invalid BOLT11 invoice" };
    }
    
    const amount = decoded.satoshis || Math.floor(Number(decoded.millisatoshis) / 1000);
    
    if (!amount || amount <= 0) {
      return { valid: false, error: "Invalid invoice amount" };
    }
    
    return { valid: true, amount };
  } catch (error: any) {
    return { valid: false, error: `Failed to decode invoice: ${error.message}` };
  }
};

export const handleServiceAccountProxyPayment = async (
  userNwcClient: NWCClient,
  targetInvoice: string,
  username?: string
): Promise<{ success: boolean; preimage?: string; fees_paid?: number; error?: string }> => {
  let userPaymentCompleted = false;
  let totalAmount = 0;
  let invoiceAmount = 0;
  let botServiceAccount: any = null;
  
  try {
    const invoiceValidation = validateTargetInvoice(targetInvoice);
    if (!invoiceValidation.valid) {
      return { success: false, error: invoiceValidation.error || "Invalid target invoice" };
    }
    
    invoiceAmount = invoiceValidation.amount!;
    const serviceFee = invoiceAmount * 0.005;
    totalAmount = invoiceAmount + serviceFee;
    
    log(`Service account proxy payment: ${invoiceAmount} sats + ${serviceFee.toFixed(3)} sats fee = ${totalAmount.toFixed(3)} sats total`, "info");
    
    botServiceAccount = await getBotServiceAccount();
    if (!botServiceAccount.success || !botServiceAccount.nwcClient) {
      return { success: false, error: "Bot service account not available" };
    }
    
    let proxyInvoice;
    try {
      proxyInvoice = await botServiceAccount.nwcClient.makeInvoice({
        amount: totalAmount * 1000,
        description: `Proxy payment for ${invoiceAmount} sats${username ? ` from ${username}` : ''}`,
      });
    } catch (invoiceError: any) {
      log(`Failed to create proxy invoice: ${invoiceError.message}`, "err");
      return { success: false, error: `Failed to create proxy invoice: ${invoiceError.message}` };
    }
    
    if (!proxyInvoice || !proxyInvoice.invoice) {
      return { success: false, error: "Failed to create proxy invoice - no invoice returned" };
    }
    
    let userPayment;
    try {
      userPayment = await userNwcClient.payInvoice({
        invoice: proxyInvoice.invoice,
      });
    } catch (userPaymentError: any) {
      log(`User payment to bot failed: ${userPaymentError.message}`, "err");
      return { success: false, error: `User payment to bot failed: ${userPaymentError.message}` };
    }
    
    if (!userPayment || !userPayment.preimage) {
      return { success: false, error: "User payment to bot failed - no preimage returned" };
    }
    
    userPaymentCompleted = true;
    log(`User successfully paid ${totalAmount} sats to bot service account`, "info");
    
    let botPayment;
    try {
      botPayment = await botServiceAccount.nwcClient.payInvoice({
        invoice: targetInvoice,
      });
    } catch (botPaymentError: any) {
      log(`Bot payment failed with error: ${botPaymentError.message}`, "err");
      
      const refundResult = await attemptRefund(userNwcClient, botServiceAccount.nwcClient, totalAmount, invoiceAmount);
      
      if (refundResult.success) {
        log(`Refund successful after bot payment error: ${totalAmount} sats returned to user`, "info");
        return { 
          success: false, 
          error: `Bot payment failed: ${botPaymentError.message}. However, ${totalAmount} sats have been refunded to your account.` 
        };
      } else {
        log(`Refund failed after bot payment error: ${refundResult.error}`, "err");
        return { 
          success: false, 
          error: `Bot payment failed: ${botPaymentError.message}. Refund also failed: ${refundResult.error}. Please contact support. Amount lost: ${totalAmount} sats` 
        };
      }
    }
    
    if (!botPayment || !botPayment.preimage) {
      log(`Bot payment failed - no preimage returned, initiating refund of ${totalAmount} sats to user`, "err");
      
      const refundResult = await attemptRefund(userNwcClient, botServiceAccount.nwcClient, totalAmount, invoiceAmount);
      
      if (refundResult.success) {
        log(`Refund successful: ${totalAmount} sats returned to user`, "info");
        return { 
          success: false, 
          error: `Payment failed, but ${totalAmount} sats have been refunded to your account` 
        };
      } else {
        log(`Refund failed: ${refundResult.error}`, "err");
        return { 
          success: false, 
          error: `Payment failed and refund also failed. Please contact support. Amount lost: ${totalAmount} sats. Error: ${refundResult.error}` 
        };
      }
    }

    const feesPaid = botPayment.fees_paid ? Number(botPayment.fees_paid.toString()) / 1000 : 0;
    log(`Proxy payment successful: ${invoiceAmount} sats paid, ${serviceFee.toFixed(3)} sats fee collected`, "info");
    
    return {
      success: true,
      preimage: botPayment.preimage,
      fees_paid: feesPaid
    };
    
  } catch (error: any) {
    log(`Service account proxy payment error: ${error.message}`, "err");
    
    if (userPaymentCompleted && botServiceAccount && totalAmount > 0 && invoiceAmount > 0) {
      log(`Attempting emergency refund due to unexpected error`, "warn");
      
      try {
        const emergencyRefund = await attemptRefund(userNwcClient, botServiceAccount.nwcClient, totalAmount, invoiceAmount);
        
        if (emergencyRefund.success) {
          log(`Emergency refund successful after unexpected error`, "info");
          return {
            success: false,
            error: `Payment failed due to unexpected error: ${error.message}. However, ${totalAmount} sats have been refunded to your account.`
          };
        } else {
          log(`Emergency refund failed: ${emergencyRefund.error}`, "err");
          return {
            success: false,
            error: `Payment failed due to unexpected error: ${error.message}. Emergency refund also failed: ${emergencyRefund.error}. Please contact support. Amount lost: ${totalAmount} sats`
          };
        }
      } catch (refundError: any) {
        log(`Emergency refund attempt failed: ${refundError.message}`, "err");
        return {
          success: false,
          error: `Payment failed due to unexpected error: ${error.message}. Emergency refund attempt also failed: ${refundError.message}. Please contact support. Amount lost: ${totalAmount} sats`
        };
      }
    }
    
    return {
      success: false,
      error: error.message || "Unknown error occurred in proxy payment"
    };
  }
};

export const handleInvoicePayment = async (
  nwcClient: NWCClient,
  invoice: string,
  isServiceAccount: boolean,
  username?: string
): Promise<{ success: boolean; preimage?: string; fees_paid?: number; error?: string }> => {
  try {
    if (!isServiceAccount) {
      // Para cuentas normales, pago directo
      const response = await nwcClient.payInvoice({
        invoice: invoice,
      });

      if (!response || !response.preimage) {
        return { success: false, error: "Error paying invoice - no preimage returned" };
      }

      return {
        success: true,
        preimage: response.preimage,
        fees_paid: response.fees_paid ? Number(response.fees_paid.toString()) / 1000 : 0
      };
    } else {
      return await handleServiceAccountProxyPayment(nwcClient, invoice, username);
    }
  } catch (error: any) {
    log(`Invoice payment error: ${error.message}`, "err");
    return {
      success: false,
      error: error.message || "Unknown error occurred"
    };
  }
};
