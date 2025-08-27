import {
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder
} from "discord.js";

interface ZapConfigData {
  isEnabled: boolean;
  zapAmount: number;
  userId: string;
  userAvatar: string;
}

export const createZapConfigEmbed = (data: ZapConfigData): EmbedBuilder => {
  return new EmbedBuilder()
    .setAuthor({
      name: "Zap Reaction Configuration",
      iconURL: `https://cdn.discordapp.com/avatars/${data.userId}/${data.userAvatar}`,
    })
    .addFields(
      {
        name: 'How it works',
        value: `• When you react with ⚡ to any message, you'll automatically send satoshis to the message author\n` +
          `• The amount sent is based on your configuration below\n` +
          `• Only works if you have this feature enabled`,
        inline: false
      }
    )
    .addFields(
      {
        name: 'Current Configuration',
        value: `**Status:** ${data.isEnabled ? '✅ Enabled' : '❌ Disabled'}\n**Amount per zap:** ${data.zapAmount.toLocaleString()} satoshis`,
        inline: false
      }
    ).setFooter({
      text: "Use the select menus below to configure your settings.",
    });
};

export const createZapConfigComponents = (isEnabled: boolean, currentAmount: number): ActionRowBuilder<StringSelectMenuBuilder>[] => {
  const statusSelect = new StringSelectMenuBuilder()
    .setCustomId('zap_status_select')
    .setPlaceholder('Select zap reactions status')
    .addOptions([
      new StringSelectMenuOptionBuilder()
        .setLabel('Enabled')
        .setDescription('Enable zap reactions')
        .setValue('enabled')
        .setEmoji('✅')
        .setDefault(isEnabled),
      new StringSelectMenuOptionBuilder()
        .setLabel('Disabled')
        .setDescription('Disable zap reactions')
        .setValue('disabled')
        .setEmoji('❌')
        .setDefault(!isEnabled)
    ]);

  const amountSelect = new StringSelectMenuBuilder()
    .setCustomId('zap_amount_select')
    .setPlaceholder(`Current: ${currentAmount} sats - Select amount`)
    .addOptions([
      new StringSelectMenuOptionBuilder()
        .setLabel('10 satoshis')
        .setValue('10')
        .setEmoji('⚡')
        .setDefault(currentAmount === 10),
      new StringSelectMenuOptionBuilder()
        .setLabel('21 satoshis')
        .setValue('21')
        .setEmoji('⚡')
        .setDefault(currentAmount === 21),
      new StringSelectMenuOptionBuilder()
        .setLabel('42 satoshis')
        .setValue('42')
        .setEmoji('⚡')
        .setDefault(currentAmount === 42),
      new StringSelectMenuOptionBuilder()
        .setLabel('69 satoshis')
        .setValue('69')
        .setEmoji('⚡')
        .setDefault(currentAmount === 69),
      new StringSelectMenuOptionBuilder()
        .setLabel('210 satoshis')
        .setValue('210')
        .setEmoji('⚡')
        .setDefault(currentAmount === 210),
    ]);

  return [
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(statusSelect),
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(amountSelect)
  ];
};
