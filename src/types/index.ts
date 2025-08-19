export interface BotConfig {
  token: string;
  mongoURI: string;
  poolAddress: string;
  lightningDomain: string;
  salt: string;
}

export interface Command {
  create: () => any;
  invoke: (interaction: any) => Promise<void>;
}

export interface Component {
  customId: string;
  invoke: (interaction: any) => Promise<void>;
}

export interface Event {
  name: string;
  once: boolean;
  invoke: (client: any, ...args: any[]) => Promise<void>;
}
