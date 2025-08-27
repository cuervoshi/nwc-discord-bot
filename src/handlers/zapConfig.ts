import { PrismaConfig } from "../utils/prisma.js";
import redisCache from "./RedisCache.js";
import { log } from "./log.js";

interface ZapConfigUpdate {
  enabled?: boolean;
  amount?: number;
}

export const updateZapConfiguration = async (
  discordId: string, 
  updates: ZapConfigUpdate
): Promise<{ success: boolean; error?: string }> => {
  try {
    const prisma = PrismaConfig.getClient();
    
    // Build update data object
    const updateData: any = {};
    if (updates.enabled !== undefined) {
      updateData.zapReaction_enabled = updates.enabled;
    }
    if (updates.amount !== undefined) {
      updateData.zapReaction_amount = updates.amount;
    }

    // Update the database
    const updatedAccount = await prisma.account.update({
      where: { discord_id: discordId },
      data: updateData
    });

    // Update cache with new values
    const cacheKey = `account:${discordId}`;
    const existingCache = await redisCache.get(cacheKey);
    
    if (existingCache && typeof existingCache === 'object') {
      const updatedCache = {
        ...existingCache as Record<string, any>,
        zapReaction_enabled: updatedAccount.zapReaction_enabled,
        zapReaction_amount: updatedAccount.zapReaction_amount
      };
      await redisCache.set(cacheKey, updatedCache, 5 * 60 * 1000);
    }

    log(`Zap configuration updated for user ${discordId}: ${JSON.stringify(updates)}`, "info");

    return { success: true };

  } catch (err: any) {
    log(`Error updating zap configuration for user ${discordId}: ${err.message}`, "err");
    return { 
      success: false, 
      error: `Failed to update zap configuration: ${err.message}` 
    };
  }
};
