import { getAccountByUsername } from '../handlers/accounts.js';
import { log } from '../handlers/log.js';
import { AccountResult } from '../types/index.js';
import { NostrWebLNProvider } from "@getalby/sdk/webln";

interface VerifyResult {
  success: boolean;
  settled?: boolean;
  error?: string;
}

async function lookupInvoice(username: string, invoice: string): Promise<VerifyResult> {
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

    log(`Invoice lookup requested for ${username} - Invoice: ${invoice}`, "info");
    
    const response = await accountResult.nwcClient.lookupInvoice({
      invoice: invoice.startsWith("ln") ? invoice : undefined,
      payment_hash: !invoice.startsWith("ln") ? invoice : undefined,
    });

    if (!response) {
      return {
        success: false,
        error: "Invoice not found"
      };
    }

    const settled = response.state === 'settled';
    
    log(`Invoice lookup result for ${username} - Settled: ${settled}`, "info");
    
    return {
      success: true,
      settled: settled
    };
    
  } catch (error: any) {
    log(`Error in lookupInvoice for ${username}: ${error.message}`, "err");
    return {
      success: false,
      error: error.message
    };
  }
}

export async function handleLud21Verify(req: any, res: any) {
  const { username, invoice } = req.params;
  
  if (!invoice) {
    return res.status(400).json({ 
      status: "ERROR", 
      reason: "Invoice parameter is required" 
    });
  }
  
  try {
    log(`LUD21 verify request for ${username} - Invoice: ${invoice}`, "info");
    
    const verifyResult = await lookupInvoice(username, invoice);
    
    if (!verifyResult.success) {
      log(`LUD21 verify error for ${username}: ${verifyResult.error}`, "err");
      
      if (verifyResult.error?.includes("User not found")) {
        return res.status(404).json({ 
          status: "ERROR", 
          reason: "User not found" 
        });
      }
      
      if (verifyResult.error?.includes("connections are not working")) {
        return res.status(503).json({ 
          status: "ERROR", 
          reason: "User wallet connections are not working" 
        });
      }
      
      return res.status(500).json({ 
        status: "ERROR", 
        reason: "Invoice verification failed" 
      });
    }
    
    log(`LUD21 verify success for ${username} - Invoice: ${invoice}`, "info");
    
    return res.json({
      settled: verifyResult.settled || false
    });
    
  } catch (error: any) {
    log(`LUD21 verify error for ${username}: ${error.message}`, "err");
    
    return res.status(500).json({ 
      status: "ERROR", 
      reason: "Invoice verification failed" 
    });
  }
}
