import { getAccountByUsername } from '../handlers/accounts.js';
import { log } from '../handlers/log.js';
import { AccountResult } from '../types/index.js';

interface InvoiceResult {
  success: boolean;
  pr?: string;
  error?: string;
}

function validateAmount(amount: string | null): number | null {
  if (typeof amount === "string") {
    try {
      const parsedAmount = parseInt(amount);
      const satoshis = Math.floor(parsedAmount / 1000);
      
      if (satoshis >= 1) {
        return satoshis;
      }
    } catch {
      return null;
    }
  }
  return null;
}

function validateComment(comment: string | null): string {
  if (!comment) return "";
  return comment.length <= 255 ? comment : "";
}

async function createInvoiceForUser(username: string, amount: number, comment: string): Promise<InvoiceResult> {
  try {
    const accountResult: AccountResult = await getAccountByUsername(username);
    
    if (!accountResult.success) {
      return {
        success: false,
        error: accountResult.message || "User not found"
      };
    }

    if (!accountResult.nwcClient) {
      return {
        success: false,
        error: "User wallet connections are not working"
      };
    }

    const invoiceResponse = await accountResult.nwcClient.makeInvoice({
      amount: amount,
      description: comment || `Payment to ${username}`
    });

    if (!invoiceResponse || !invoiceResponse.invoice) {
      return {
        success: false,
        error: "Failed to create invoice"
      };
    }

    log(`Invoice created for ${username} - Amount: ${amount} sats`, "info");

    return {
      success: true,
      pr: invoiceResponse.invoice
    };
  } catch (error: any) {
    log(`Error creating invoice for ${username}: ${error.message}`, "err");
    return {
      success: false,
      error: error.message
    };
  }
}

export async function handleLud16Callback(req: any, res: any) {
  const { username } = req.params;
  const { amount, comment, nostr } = req.query;
  
  // Validate amount
  const validatedAmount = validateAmount(amount as string);
  if (validatedAmount === null) {
    return res.status(422).json({ 
      status: "ERROR", 
      reason: "Invalid amount - minimum 1000 millisatoshis (1 satoshi) required" 
    });
  }
  
  // Validate comment
  const validatedComment = validateComment(comment as string);
  if (comment && validatedComment === "") {
    return res.status(422).json({ 
      status: "ERROR", 
      reason: "Comment too long (max 255 characters)" 
    });
  }
  
  // Check for nostr parameter
  if (nostr) {
    return res.status(422).json({ 
      status: "ERROR", 
      reason: "Nostr zaps not supported" 
    });
  }
  
  try {
    log(`LNURL callback request for ${username} - Amount: ${validatedAmount}`, "info");
    
    const invoiceResult = await createInvoiceForUser(username, amount, validatedComment);
    
    if (!invoiceResult.success) {
      log(`LNURL callback error for ${username}: ${invoiceResult.error}`, "err");
      
      if (invoiceResult.error?.includes("User not found")) {
        return res.status(404).json({ 
          status: "ERROR", 
          reason: "User not found" 
        });
      }
      
      if (invoiceResult.error?.includes("connections are not working")) {
        return res.status(503).json({ 
          status: "ERROR", 
          reason: "User wallet connections are not working" 
        });
      }
      
      return res.status(500).json({ 
        status: "ERROR", 
        reason: "Payment processing failed" 
      });
    }
    
    log(`LNURL callback success for ${username} - Invoice created`, "info");
    
    return res.json({
      pr: invoiceResult.pr,
      routes: []
    });
    
  } catch (error: any) {
    log(`LNURL callback error for ${username}: ${error.message}`, "err");
    
    return res.status(500).json({ 
      status: "ERROR", 
      reason: "Payment processing failed" 
    });
  }
}
