import { ButtonInteraction } from "discord.js";
import { getFaucet } from "../../handlers/faucet.js";
import { log } from "../../handlers/log.js";
import {
  EphemeralMessageResponse,
  FollowUpEphemeralResponse,
} from "../../utils/helperFunctions.js";
import { faucetQueues, processFaucetQueue } from "./claim.js";
import { Faucet } from "types/faucet.js";

const customId = "closefaucet";

const invoke = async (interaction: ButtonInteraction): Promise<void> => {
  try {
    const user = interaction.user;
    if (!user) return;

    await interaction.deferReply({ ephemeral: true });

    const footerContent: string | undefined = interaction.message.embeds[0]?.footer?.text;
    const faucetSubStr: number = footerContent ? footerContent.indexOf(" ") : -1;

    const faucetId: string | false = faucetSubStr !== -1
      ? footerContent.substring(faucetSubStr + 1, footerContent.length)
      : false;

    if (!faucetId) {
      return EphemeralMessageResponse(interaction, "No se encontró el faucet");
    }

    log(`${user.username} presionó el botón cerrar faucet, en el faucet ${faucetId}`, "info");

    const faucet: Faucet = await getFaucet(faucetId);

    if (!faucet) {
      return FollowUpEphemeralResponse(
        interaction,
        "El faucet que intentas cerrar no se encuentra en la base de datos"
      );
    }

    if (faucet.owner_id !== interaction.user.id) {
      return FollowUpEphemeralResponse(
        interaction,
        "No puedes cerrar un faucet que no te pertenece"
      );
    }

    if (faucet.closed) {
      return FollowUpEphemeralResponse(
        interaction,
        "El faucet ya se encuentra cerrado."
      );
    }

    if (!faucetQueues.has(faucetId)) {
      faucetQueues.set(faucetId, []);
    }

    faucetQueues.get(faucetId)!.push({
      operation: 'close',
      interaction,
      faucet
    });

    if (faucetQueues.get(faucetId)!.length === 1) {
      processFaucetQueue(faucetId);
    }

  } catch (err: any) {
    log(`Error cuando @${interaction.user.username} intentó cerrar un faucet: ${err.message}`, "err");
    EphemeralMessageResponse(interaction, "Ocurrió un error");
  }
};

export { customId, invoke };
