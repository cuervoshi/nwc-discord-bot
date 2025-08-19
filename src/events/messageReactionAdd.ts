import { MessageReaction, User } from "discord.js";
import { zap } from "../handlers/zap.js";
import { TimedMessage } from "../utils/helperFunctions.js";
import { updateUserRank } from "../handlers/donate.js";
import { log } from "../handlers/log.js";

const once = false;
const name = "messageReactionAdd";

async function invoke(reaction: MessageReaction, user: User) {
  /*try {
    if (user.partial) {
      try {
        await user.fetch();
      } catch (err) {
        throw new Error("Fetch partial user error: " + err);
      }
    }

    if (user.bot) return;

    if (reaction.partial) {
      try {
        await reaction.fetch();
      } catch (error) {
        throw new Error("Fetch partial message error: " + error);
      }
    }

    let amount = 0;
    switch (reaction.emoji.name) {
      case "⚡":
        log(
          `${user.username} reaccionó con ⚡ al mensaje: "${reaction.message.content}"`,
          "info"
        );
        amount = 21;
        break;
      case "🚀":
        log(
          `${user.username} reaccionó con 🚀 al mensaje: "${reaction.message.content}"`,
          "info"
        );
        amount = 210;
        break;
    }

    if (!amount) return;

    const receiver = reaction.message.author;
    if (!receiver) return;

    const onSuccess = async () => {
      try {
        await updateUserRank(user.id, "comunidad", amount);

        log(
          `@${user.username} pago la factura del zap hacia @${receiver.username}`,
          "info"
        );

        await (reaction.message.channel as any).send({
          content: `${user.toString()} envió ${amount} satoshis a ${receiver.toString()}`,
        });
      } catch (err) {
        console.log(err);
        if (reaction.message.channel.isTextBased()) {
          TimedMessage("Ocurrió un error", reaction.message.channel as any, 5000);
        }
      }
    };

    const onError = () => {
      log(
        `@${user.username} tuvo un error al realizar el pago del zap hacia @${receiver.username}`,
        "err"
      );

      if (reaction.message.channel.isTextBased()) {
        TimedMessage("Ocurrió un error", reaction.message.channel as any, 5000);
      }
    };

    const { success, message } = await zap(
      user,
      receiver,
      amount,
      onSuccess,
      onError,
      `${user.username} reaccionó con ⚡ a un mensaje tuyo`
    );

    if (!success && reaction.message.channel.isTextBased()) {
      TimedMessage(message, reaction.message.channel as any, 5000);
    }
  } catch (err: any) {
    log(
      `Error al enviar zap por reacción del usuario @${user.username} a @${reaction.message.author?.username} - Código de error ${err.code} Mensaje: ${err.message}`,
      "err"
    );
    if (reaction.message.channel.isTextBased()) {
      TimedMessage("Ocurrió un error", reaction.message.channel as any, 5000);
    }
  }*/
}

export { once, name, invoke };
