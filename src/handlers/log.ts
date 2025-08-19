import chalk from "chalk";
import { TimestampStylesString } from "discord.js";

type LogStyle = 'info' | 'err' | 'warn' | 'done' | undefined;

/**
 * Logs a message with timestamp and optional styling
 * @param string - The message to log
 * @param style - The style/type of log message
 */
const log = (string: string, style: LogStyle): void => {
  const date = new Date();

  const [hour, minutes, seconds] = [
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
  ];

  switch (style) {
    case "info": {
      console.log(
        chalk.blue(`[INFO] ${hour}:${minutes}:${seconds} • ${string}`)
      );
      break;
    }

    case "err": {
      console.error(
        chalk.red(`[ERROR] ${hour}:${minutes}:${seconds} • ${string}`)
      );
      break;
    }

    case "warn": {
      console.warn(
        chalk.yellow(`[WARNING] ${hour}:${minutes}:${seconds} • ${string}`)
      );
      break;
    }

    case "done": {
      console.log(
        chalk.green(`[SUCCESS] ${hour}:${minutes}:${seconds} • ${string}`)
      );
      break;
    }

    default: {
      console.log(`${hour}:${minutes}:${seconds} • ${string}`);
      break;
    }
  }
};

/**
 * Formats a timestamp for Discord
 * @param time - Unix timestamp in milliseconds
 * @param style - Discord timestamp style
 * @returns Formatted Discord timestamp string
 */
const time = (time: number, style?: TimestampStylesString): `<t:${string}>` => {
  return `<t:${Math.floor(time / 1000)}${style ? `:${style}` : ""}>`;
};

export { log, time };
