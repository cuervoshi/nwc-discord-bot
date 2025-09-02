import dedent from "dedent-js";
import { ActionRowBuilder, ButtonBuilder, EmbedBuilder, ButtonInteraction, Message } from "discord.js";
import { getBotServiceAccount, getAccount } from "../../handlers/accounts.js";
import { trackSatsSent } from "../../handlers/ranking.js";
import {
  addClaimerOnFaucet,
  closeFaucet,
  getFaucet,
} from "../../handlers/faucet.js";
import { log } from "../../handlers/log.js";
import PQueue from "p-queue";
import { AuthorConfig } from "../../utils/helperConfig.js";
import {
  EphemeralMessageResponse,
  FollowUpEphemeralResponse
} from "../../utils/helperFunctions.js";
import { handleInvoicePayment } from "../../handlers/payments.js";
import { Faucet } from "../../types/index.js";
import { NWCClient } from "@getalby/sdk";

interface InvoiceDetails {
  invoice: string;
}

interface BalanceResponse {
  balance: number;
}

interface AccountResult {
  success: boolean;
  message?: string;
  nwcClient?: NWCClient;
  isServiceAccount?: boolean;
}

interface ServiceAccountResult {
  nwcClient?: NWCClient;
}

const customId = "claim";
const faucetQueues = new Map<string, PQueue>();

const getFaucetQueue = (faucetId: string): PQueue => {
  if (!faucetId || typeof faucetId !== 'string') {
    throw new Error("Invalid faucet ID");
  }

  if (!faucetQueues.has(faucetId)) {
    const queue = new PQueue({
      concurrency: 1,
      timeout: 15000
    });

    queue.on('add', () => {
      log(`Item added to faucet ${faucetId} queue - Size: ${queue.size}`, "info");
    });

    queue.on('active', () => {
      log(`Processing item from faucet ${faucetId} queue - Pending: ${queue.pending}`, "info");
    });

    queue.on('completed', () => {
      log(`Item completed in faucet ${faucetId} queue - Size: ${queue.size}`, "info");
    });

    queue.on('error', (error) => {
      log(`Error in faucet ${faucetId} queue: ${error}`, "err");
    });

    queue.on('idle', () => {
      log(`Faucet ${faucetId} queue is idle - Size: ${queue.size}`, "info");
    });

    faucetQueues.set(faucetId, queue);
  }
  return faucetQueues.get(faucetId)!;
};

const addToFaucetQueue = async (faucetId: string, operation: 'claim' | 'close', interaction: ButtonInteraction, faucet: Faucet): Promise<void> => {
  if (!faucet || !faucet.id) {
    throw new Error("Invalid faucet data");
  }

  const queue = getFaucetQueue(faucetId);

  log(`Adding ${operation} operation to faucet ${faucetId} queue for user: ${interaction.user.username}`, "info");

  await queue.add(async () => {
    log(`Executing ${operation} operation for faucet ${faucetId} - User: ${interaction.user.username}`, "info");

    try {
      if (operation === 'claim') {
        await handleClaim(faucet, interaction);
      } else if (operation === 'close') {
        await handleClose(faucet, interaction);
      }
    } catch (error) {
      log(`Error executing ${operation} operation for faucet ${faucetId}: ${error}`, "err");

      try {
        if (operation === 'claim') {
          EphemeralMessageResponse(interaction, `❌ **Claim failed:** ${error.message || 'Unknown error'}`);
        } else if (operation === 'close') {
          EphemeralMessageResponse(interaction, `❌ **Close failed:** ${error.message || 'Unknown error'}`);
        }
      } catch (sendError) {
        log(`Failed to send error message to user: ${sendError}`, "err");
      }

      throw error;
    }
  });
};

const handleClaim = async (faucet: Faucet, interaction: ButtonInteraction): Promise<void> => {
  try {
    const userId: string = interaction.user.id;
    const faucetId: string = faucet.id;

    const currentFaucet = await getFaucet(faucetId);

    if (!currentFaucet) {
      throw new Error("Faucet not found in database");
    }

    if (currentFaucet.closed) {
      throw new Error("The faucet was closed while waiting in queue");
    }

    if (currentFaucet.claimersIds.includes(userId)) {
      throw new Error("You can only claim the reward once");
    }

    if (currentFaucet.claimersIds.length >= currentFaucet.maxUses) {
      throw new Error("All sats have been claimed");
    }

    const userWallet: AccountResult = await getAccount(interaction, userId);
    const faucetWallet: ServiceAccountResult = await getBotServiceAccount();

    if (!userWallet.success || !userWallet.nwcClient) {
      throw new Error("Could not get user account");
    }

    const invoiceDetails: InvoiceDetails = await userWallet.nwcClient.makeInvoice({
      amount: faucet.amount * 1000,
      description: `LNBot: Faucet claim`
    });

    const paymentResult = await handleInvoicePayment(
      faucetWallet.nwcClient,
      invoiceDetails.invoice,
      false,
      interaction.user.username
    );

    if (!paymentResult.success) {
      throw new Error(paymentResult.error || "Error claiming faucet");
    }

    const content: string = interaction.message.embeds[0].fields[0].value;
    const subStr: number = content.indexOf(">");

    const senderUserId: string = subStr !== -1 ? content.substring(2, subStr) : "";
    const fieldInfo = interaction.message.embeds[0].fields[0];

    if (senderUserId) {
      await trackSatsSent(senderUserId, faucet.amount);
    }

    await addClaimerOnFaucet(faucetId, userId);
    await updateMessage(faucetId, fieldInfo, interaction.message);

    const new_user_balance: BalanceResponse = await userWallet.nwcClient.getBalance();

    FollowUpEphemeralResponse(
      interaction,
      `You received ${faucet.amount} sats for claiming this faucet, your new balance is: ${(
        new_user_balance.balance / 1000
      ).toFixed(0)} satoshis`
    );
  } catch (err: any) {
    log(`Error in handleClaim for @${interaction.user.username}: ${err.message}`, "err");
    throw err;
  }
};

const handleClose = async (faucet: Faucet, interaction: ButtonInteraction): Promise<void> => {
  try {
    const user = interaction.user;
    const faucetId: string = faucet.id;

    log(`${user.username} closing faucet ${faucetId}`, "info");

    const currentFaucet = await getFaucet(faucetId);

    if (!currentFaucet) {
      throw new Error("Faucet not found in database");
    }

    if (currentFaucet.closed) {
      throw new Error("The faucet was already closed");
    }

    if (currentFaucet.owner_id !== user.id) {
      throw new Error("You cannot close a faucet that does not belong to you");
    }

    const wallet: AccountResult = await getAccount(interaction, user.id);
    const faucetWallet: ServiceAccountResult = await getBotServiceAccount();
    const closedFaucet = await closeFaucet(faucetId);

    if (closedFaucet && wallet.success && wallet.nwcClient) {
      const unclaimed: number = closedFaucet.maxUses - closedFaucet.claimersIds.length;
      const unclaimedAmount: number = (unclaimed * closedFaucet.amount);

      if (unclaimedAmount > 0) {
        const invoiceDetails: InvoiceDetails = await wallet.nwcClient.makeInvoice({
          amount: unclaimedAmount * 1000,
          description: `LNBot: Faucet refund`
        });

        if (invoiceDetails && invoiceDetails.invoice) {
          const paymentResult = await handleInvoicePayment(
            faucetWallet.nwcClient,
            invoiceDetails.invoice,
            true,
            user.username
          );

          if (!paymentResult.success) {
            throw new Error(paymentResult.error || "Error refunding funds");
          }

          log(`${user.username} closed faucet ${faucetId} and was refunded ${unclaimedAmount} sats`, "done");

          FollowUpEphemeralResponse(
            interaction,
            `You successfully closed the faucet, ${unclaimedAmount} sats were refunded`
          );
        }
      } else {
        FollowUpEphemeralResponse(interaction, "You successfully closed the faucet. There were no funds to refund.");
      }

      await updateCloseMessage(faucetId, interaction.message);
    }
  } catch (err: any) {
    log(`Error in handleClose for @${interaction.user.username}: ${err.message}`, "err");
    throw err;
  }
};

const updateMessage = async (faucetId: string, fieldInfo: any, message: Message): Promise<void> => {
  try {
    const faucet: Faucet = await getFaucet(faucetId);
    const uses: number = faucet.claimersIds.length;

    let claimersOutput: string = ``;
    faucet.claimersIds.forEach((claimer: string) => {
      claimersOutput += `
                      <@${claimer}>
                    `;
      claimersOutput = dedent(claimersOutput);
    });

    const embed = new EmbedBuilder()
      .setAuthor(AuthorConfig)
      .addFields([
        fieldInfo,
        {
          name: `Remaining: ${faucet.amount * (faucet.maxUses - uses)}/${faucet.amount * faucet.maxUses} sats`,
          value: `${":white_check_mark:".repeat(uses)}${faucet.maxUses - uses > 0 ? ":x:".repeat(faucet.maxUses - uses) : ""} \n\n`,
        },
        {
          name: "Claimed by:",
          value: claimersOutput,
        },
      ])
      .setFooter({
        text: `Identifier: ${faucetId}`,
      });

    const disabledFaucet: boolean = faucet.maxUses <= uses;
    const components: ButtonBuilder[] = [
      new ButtonBuilder()
        .setCustomId("claim")
        .setLabel(disabledFaucet ? "All sats have been claimed" : `Claim`)
        .setEmoji({ name: `💸` })
        .setStyle(2)
        .setDisabled(disabledFaucet),
    ];

    if (!disabledFaucet) {
      components.push(
        new ButtonBuilder()
          .setCustomId("closefaucet")
          .setLabel("Close faucet")
          .setEmoji({ name: `✖️` })
          .setStyle(2)
      );
    } else {
      await closeFaucet(faucetId);
    }

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(components);

    await message.edit({
      embeds: [embed],
      components: [row],
    });
  } catch (err: any) {
    console.log(err);
    await message.edit({ content: "An error occurred" });
  }
};

const updateCloseMessage = async (faucetId: string, message: Message): Promise<void> => {
  try {
    const fieldsInfo = message.embeds[0].fields;

    const embed = new EmbedBuilder()
      .setAuthor(AuthorConfig)
      .addFields(fieldsInfo)
      .setFooter({
        text: `Identifier: ${faucetId}`,
      });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents([
      new ButtonBuilder()
        .setCustomId("closefaucet")
        .setLabel("The faucet has been closed by its author")
        .setEmoji({ name: `✖️` })
        .setStyle(2)
        .setDisabled(true),
    ]);

    await message.edit({
      embeds: [embed],
      components: [row],
    });
  } catch (err: any) {
    console.log(err);
  }
};

const invoke = async (interaction: ButtonInteraction): Promise<void> => {
  try {
    await interaction.deferReply({ ephemeral: true });

    const footerContent: string | undefined = interaction.message.embeds[0]?.footer?.text;
    const faucetSubStr: number = footerContent ? footerContent.indexOf(" ") : -1;

    const faucetId: string | false = faucetSubStr !== -1
      ? footerContent.substring(faucetSubStr + 1, footerContent.length)
      : false;

    if (!faucetId) {
      return EphemeralMessageResponse(interaction, "Faucet not found");
    }

    const faucet: Faucet = await getFaucet(faucetId);
    const userId: string = interaction.user.id;

    if (!faucet) {
      return FollowUpEphemeralResponse(
        interaction,
        "The faucet you are trying to claim is not found in the database"
      );
    }

    if (faucet.owner_id === userId) {
      return FollowUpEphemeralResponse(
        interaction,
        "You cannot claim your own faucet"
      );
    }

    if (faucet.claimersIds.includes(userId)) {
      return FollowUpEphemeralResponse(
        interaction,
        "You can only claim the reward once"
      );
    }

    if (faucet.closed) {
      return FollowUpEphemeralResponse(
        interaction,
        "The faucet you are trying to claim was closed by its author"
      );
    }

    await addToFaucetQueue(faucetId, 'claim', interaction, faucet);

  } catch (err: any) {
    log(`Error when @${interaction.user.username} tried to claim a faucet: ${err.message}`, "err");
    EphemeralMessageResponse(interaction, `❌ **Error:** ${err.message || 'Unknown error occurred'}`);
  }
};

export const addCloseOperation = async (faucet: Faucet, interaction: ButtonInteraction): Promise<void> => {
  const faucetId = faucet.id;
  await addToFaucetQueue(faucetId, 'close', interaction, faucet);
};

export const cleanupFaucetQueue = (faucetId: string): void => {
  if (faucetQueues.has(faucetId)) {
    const queue = faucetQueues.get(faucetId)!;
    queue.clear();
    faucetQueues.delete(faucetId);
    log(`Cleaned up queue for faucet ${faucetId}`, "info");
  }
};

export const getQueueStats = (faucetId: string) => {
  if (faucetQueues.has(faucetId)) {
    const queue = faucetQueues.get(faucetId)!;
    return {
      size: queue.size,
      pending: queue.pending,
      isPaused: queue.isPaused
    };
  }
  return null;
};

export { customId, invoke, faucetQueues };
