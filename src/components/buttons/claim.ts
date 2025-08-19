import dedent from "dedent-js";
import { ActionRowBuilder, ButtonBuilder, EmbedBuilder, ButtonInteraction, Message } from "discord.js";
import { getServiceAccount, getAndValidateAccount } from "../../handlers/accounts.js";
import { updateUserRank } from "../../handlers/donate.js";
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
import { Faucet } from "types/faucet.js";

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
  nwcClient?: {
    makeInvoice: (params: { amount: number; description: string }) => Promise<InvoiceDetails>;
    getBalance: () => Promise<BalanceResponse>;
  };
}

interface ServiceAccountResult {
  nwcClient?: {
    payInvoice: (params: { invoice: string }) => Promise<any>;
  };
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
    
    log(`Lock adquirido para faucet ${faucetId} - Operación: ${operation}`, "info");
    
    try {
      if (operation === 'claim') {
        await handleClaim(faucet, interaction);
      } else if (operation === 'close') {
        await handleClose(faucet, interaction);
      }
    } finally {
      log(`Lock liberado para faucet ${faucetId}`, "info");
      release();
    }
  }
};

const handleClaim = async (faucet: Faucet, interaction: ButtonInteraction): Promise<void> => {
  try {
    const userId: string = interaction.user.id;
    const faucetId: string = faucet._id.toString();

    const userWallet: AccountResult = await getAndValidateAccount(interaction, userId);
    const faucetWallet: ServiceAccountResult = await getServiceAccount(interaction);

    if (!userWallet.success || !userWallet.nwcClient) {
      throw new Error("No se pudo obtener la cuenta del usuario");
    }

    const invoiceDetails: InvoiceDetails = await userWallet.nwcClient.makeInvoice({
      amount: faucet.amount * 1000,
      description: `LNBot: Reclamo de faucet`
    });

    const response = await faucetWallet.nwcClient.payInvoice({
      invoice: invoiceDetails.invoice,
    });

    if (!response) throw new Error("Error al reclamar el faucet");

    const content: string = interaction.message.embeds[0].fields[0].value;
    const subStr: number = content.indexOf(">");

    const senderUserId: string = subStr !== -1 ? content.substring(2, subStr) : "";
    const fieldInfo = interaction.message.embeds[0].fields[0];

    if (senderUserId) {
      await updateUserRank(senderUserId, "comunidad", faucet.amount);
    }

    await addClaimerOnFaucet(faucetId, userId);
    await updateMessage(faucetId, fieldInfo, interaction.message);

    const new_user_balance: BalanceResponse = await userWallet.nwcClient.getBalance();

    FollowUpEphemeralResponse(
      interaction,
      `Recibiste ${faucet.amount} sats por reclamar este faucet, tu nuevo balance es: ${(
        new_user_balance.balance / 1000
      ).toFixed(0)} satoshis`
    );
  } catch (err: any) {
    log(`Error en handleClaim para @${interaction.user.username}: ${err.message}`, "err");
    EphemeralMessageResponse(interaction, "Ocurrió un error al reclamar la factura, intenta nuevamente.");
  }
};

const handleClose = async (faucet: Faucet, interaction: ButtonInteraction): Promise<void> => {
  try {
    const user = interaction.user;
    const faucetId: string = faucet._id.toString();

    log(`${user.username} cerrando faucet ${faucetId}`, "info");

    const wallet: AccountResult = await getAndValidateAccount(interaction, user.id);
    const faucetWallet: ServiceAccountResult = await getServiceAccount(interaction);
    const closedFaucet = await closeFaucet(faucetId);

    if (closedFaucet && wallet.success && wallet.nwcClient) {
      const unclaimed: number = closedFaucet.maxUses - closedFaucet.claimersIds.length;
      const unclaimedAmount: number = (unclaimed * closedFaucet.amount);

      if (unclaimedAmount > 0) {
        const invoiceDetails: InvoiceDetails = await wallet.nwcClient.makeInvoice({
          amount: unclaimedAmount * 1000,
          description: `LNBot: Reintegro de faucet`
        });

        if (invoiceDetails && invoiceDetails.invoice) {
          const response = await faucetWallet.nwcClient.payInvoice({
            invoice: invoiceDetails.invoice,
          });

          if (!response) throw new Error("Error al reintegrar los fondos");

          log(`${user.username} cerró el faucet ${faucetId} y se le reintegraron ${unclaimedAmount} sats`, "done");

          FollowUpEphemeralResponse(
            interaction,
            `Cerraste el faucet exitosamente, se reintegraron ${unclaimedAmount} sats`
          );
        }
      } else {
        FollowUpEphemeralResponse(interaction, "Cerraste el faucet exitosamente. No había fondos para reintegrar.");
      }

      await updateCloseMessage(faucetId, interaction.message);
    }
  } catch (err: any) {
    log(`Error en handleClose para @${interaction.user.username}: ${err.message}`, "err");
    EphemeralMessageResponse(interaction, "Ocurrió un error al cerrar el faucet");
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
          name: `Restantes: ${faucet.amount * (faucet.maxUses - uses)}/${faucet.amount * faucet.maxUses} sats`,
          value: `${":white_check_mark:".repeat(uses)}${faucet.maxUses - uses > 0 ? ":x:".repeat(faucet.maxUses - uses) : ""} \n\n`,
        },
        {
          name: "Reclamado por:",
          value: claimersOutput,
        },
      ])
      .setFooter({
        text: `Identificador: ${faucetId}`,
      });

    const disabledFaucet: boolean = faucet.maxUses <= uses;
    const components: ButtonBuilder[] = [
      new ButtonBuilder()
        .setCustomId("claim")
        .setLabel(disabledFaucet ? "Todos los sats han sido reclamados" : `Reclamar`)
        .setEmoji({ name: `💸` })
        .setStyle(2)
        .setDisabled(disabledFaucet),
    ];

    if (!disabledFaucet) {
      components.push(
        new ButtonBuilder()
          .setCustomId("closefaucet")
          .setLabel("Cerrar faucet")
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
    await message.edit({ content: "Ocurrió un error" });
  }
};

const updateCloseMessage = async (faucetId: string, message: Message): Promise<void> => {
  try {
    const fieldsInfo = message.embeds[0].fields;

    const embed = new EmbedBuilder()
      .setAuthor(AuthorConfig)
      .addFields(fieldsInfo)
      .setFooter({
        text: `Identificador: ${faucetId}`,
      });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents([
      new ButtonBuilder()
        .setCustomId("closefaucet")
        .setLabel("El faucet ha sido cerrado por su autor")
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
      return EphemeralMessageResponse(interaction, "No se encontró el faucet");
    }

    const faucet: Faucet = await getFaucet(faucetId);
    const userId: string = interaction.user.id;

    if (!faucet) {
      return FollowUpEphemeralResponse(
        interaction,
        "El faucet que intentas reclamar no se encuentra en la base de datos"
      );
    }

    if (faucet.owner_id === userId) {
      return FollowUpEphemeralResponse(
        interaction,
        "No puedes reclamar tu propio faucet"
      );
    }

    if (faucet.claimersIds.includes(userId)) {
      return FollowUpEphemeralResponse(
        interaction,
        "Solo puedes reclamar el premio una vez"
      );
    }

    if (faucet.closed) {
      return FollowUpEphemeralResponse(
        interaction,
        "El faucet que intentas reclamar fue cerrado por su autor"
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
    log(`Error cuando @${interaction.user.username} intentó reclamar un faucet: ${err.message}`, "err");
    EphemeralMessageResponse(interaction, "Ocurrió un error al reclamar la factura, intenta nuevamente.");
  }
};

export { customId, invoke, faucetQueues, processFaucetQueue };
