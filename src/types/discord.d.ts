import { Client, Collection } from "discord.js";

declare module "discord.js" {
  export interface Client {
    commands: Collection<string, any>;
    components: Collection<string, any>;
  }
}

export interface ExtendedClient extends Client {
  commands: Collection<string, any>;
  components: Collection<string, any>;
}
