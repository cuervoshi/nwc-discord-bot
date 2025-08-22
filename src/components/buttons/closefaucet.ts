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
      return EphemeralMessageResponse(interaction, "Faucet not found");
    }

    log(`${user.username} pressed the close faucet button, on faucet ${faucetId}`, "info");

    const faucet: Faucet = await getFaucet(faucetId);

    if (!faucet) {
      return FollowUpEphemeralResponse(
        interaction,
        "The faucet you are trying to close is not found in the database"
      );
    }

    if (faucet.owner_id !== interaction.user.id) {
      return FollowUpEphemeralResponse(
        interaction,
        "You cannot close a faucet that does not belong to you"
      );
    }

    if (faucet.closed) {
      return FollowUpEphemeralResponse(
        interaction,
        "The faucet is already closed."
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
    log(`Error when @${interaction.user.username} tried to close a faucet: ${err.message}`, "err");
    EphemeralMessageResponse(interaction, "An error occurred");
  }
};

export { customId, invoke };
