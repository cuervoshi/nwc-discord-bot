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
import { SimpleLock } from "../../handlers/SimpleLock.js";
import { AuthorConfig } from "../../utils/helperConfig.js";
import {
  EphemeralMessageResponse,
  FollowUpEphemeralResponse
} from "../../utils/helperFunctions.js";
import { handleInvoicePayment } from "../../handlers/payments.js";
import { Faucet } from "../../types/index.js";
import { NWCClient } from "@getalby/sdk";

interface QueueItem {
  operation: 'claim' | 'close';
  interaction: ButtonInteraction;
  faucet: Faucet;
}

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

const faucetLocks = new Map<string, SimpleLock>();
const faucetQueues = new Map<string, QueueItem[]>();

const getFaucetLock = (faucetId: string): SimpleLock => {
  if (!faucetLocks.has(faucetId)) {
    faucetLocks.set(faucetId, new SimpleLock());
  }
  return faucetLocks.get(faucetId)!;
};

const processFaucetQueue = async (faucetId: string): Promise<void> => {
  const queue = faucetQueues.get(faucetId) || [];
  
  while (queue.length > 0) {
    const { operation, interaction, faucet } = queue.shift()!;
    const lock = getFaucetLock(faucetId);
    const release = await lock.acquire();
    
    log(`Lock acquired for faucet ${faucetId} - Operation: ${operation}`, "info");
    
    try {
      if (operation === 'claim') {
        await handleClaim(faucet, interaction);
      } else if (operation === 'close') {
        await handleClose(faucet, interaction);
      }
    } finally {
      log(`Lock released for faucet ${faucetId}`, "info");
      release();
    }
  }
};

const handleClaim = async (faucet: Faucet, interaction: ButtonInteraction): Promise<void> => {
  try {
    const userId: string = interaction.user.id;
    const faucetId: string = faucet.id;

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
    EphemeralMessageResponse(interaction, "❌ **An error occurred while claiming the invoice.**\n\n**Please ensure you have allowed at least 10 sats for routing fees in your NWC connection, as this is often the cause of payment failures.**\n\nPlease try again.");
  }
};

const handleClose = async (faucet: Faucet, interaction: ButtonInteraction): Promise<void> => {
  try {
    const user = interaction.user;
    const faucetId: string = faucet.id;

    log(`${user.username} closing faucet ${faucetId}`, "info");

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
    EphemeralMessageResponse(interaction, "An error occurred while closing the faucet");
  }
};

const updateMessage = async (faucetId: string, fieldInfo: any, message: Message): Promise<void> => {
  try {
    const faucet: Faucet = await getFaucet(faucetId);
    const uses: number = faucet.claimersIds.length;

    let claimersOutput: string = ``;
    faucet.claimersIds.forEach((claimer: string) => {
      claimersOutput += `<@${claimer}>`;
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

    if (!faucetQueues.has(faucetId)) {
      faucetQueues.set(faucetId, []);
    }

    faucetQueues.get(faucetId)!.push({
      operation: 'claim',
      interaction,
      faucet
    });

    if (faucetQueues.get(faucetId)!.length === 1) {
      processFaucetQueue(faucetId);
    }

  } catch (err: any) {
    log(`Error when @${interaction.user.username} tried to claim a faucet: ${err.message}`, "err");
    EphemeralMessageResponse(interaction, "❌ **An error occurred while claiming the invoice.**\n\n**Please ensure you have allowed at least 10 sats for routing fees in your NWC connection, as this is often the cause of payment failures.**\n\nPlease try again.");
  }
};

export { customId, invoke, faucetQueues, processFaucetQueue };
