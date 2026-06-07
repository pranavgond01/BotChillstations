import {
  EmbedBuilder,
  PermissionFlagsBits,
  type Message,
  type TextChannel,
} from "discord.js";

const C = 0xff0000;
const NO_PING = { parse: [] as never[] };

function sanitize(text: string): string {
  return text
    .replace(/@everyone/gi, "@\u200beveryone")
    .replace(/@here/gi, "@\u200bhere");
}

export async function handleSend(message: Message): Promise<void> {
  if (!message.guild) return;
  const mod = message.guild.members.cache.get(message.author.id);
  if (!mod?.permissions.has(PermissionFlagsBits.ManageMessages)) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ You need **Manage Messages** permission.")] });
    return;
  }

  const raw = message.content.trim().replace(/^!send\s*/i, "");
  const targetChannel = message.mentions.channels.first() as TextChannel | undefined;

  let content: string;
  let dest: TextChannel;

  if (targetChannel) {
    content = raw.replace(/<#\d+>/g, "").trim();
    dest = targetChannel;
  } else {
    content = raw;
    dest = message.channel as TextChannel;
  }

  if (!content) {
    await message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(C)
          .setTitle("📤 !send")
          .setDescription(
            "**Usage:** `!send <message>`\n" +
            "**To a channel:** `!send #channel <message>`\n\n" +
            "**Placeholders:** `{user}` `{server}` `{count}`"
          ),
      ],
    });
    return;
  }

  const resolved = sanitize(
    content
      .replace(/{user}/g, `<@${message.author.id}>`)
      .replace(/{username}/g, message.author.username)
      .replace(/{server}/g, message.guild.name)
      .replace(/{count}/g, String(message.guild.memberCount))
  );

  await dest.send({ content: resolved, allowedMentions: NO_PING });
  await message.delete().catch(() => {});
}

export async function handleSay(message: Message): Promise<void> {
  if (!message.guild) return;
  const mod = message.guild.members.cache.get(message.author.id);
  if (!mod?.permissions.has(PermissionFlagsBits.ManageMessages)) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ You need **Manage Messages** permission.")] });
    return;
  }

  const text = message.content.trim().replace(/^!say\s*/i, "");
  if (!text) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Usage: `!say <message>`")] });
    return;
  }

  await message.delete().catch(() => {});
  await (message.channel as TextChannel).send({ content: sanitize(text), allowedMentions: NO_PING });
}

export async function handleEmbed(message: Message): Promise<void> {
  if (!message.guild) return;
  const mod = message.guild.members.cache.get(message.author.id);
  if (!mod?.permissions.has(PermissionFlagsBits.ManageMessages)) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ You need **Manage Messages** permission.")] });
    return;
  }

  const raw = message.content.trim().replace(/^!embed\s*/i, "");
  const targetChannel = message.mentions.channels.first() as TextChannel | undefined;
  const cleanRaw = targetChannel ? raw.replace(/<#\d+>/g, "").trim() : raw;
  const dest = targetChannel ?? (message.channel as TextChannel);

  const parts = cleanRaw.split("|").map((p) => p.trim());

  if (parts.length < 1 || !parts[0]) {
    await message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(C)
          .setTitle("📦 !embed")
          .setDescription(
            "**Usage:** `!embed <title> | <description>`\n" +
            "**With channel:** `!embed #channel <title> | <description>`\n" +
            "**Description only:** `!embed <description>`"
          ),
      ],
    });
    return;
  }

  const embed = new EmbedBuilder().setColor(C).setTimestamp();

  if (parts.length === 1) {
    embed.setDescription(parts[0]);
  } else {
    embed.setTitle(parts[0]).setDescription(parts[1]);
    if (parts[2]) embed.setFooter({ text: parts[2] });
  }

  await dest.send({ embeds: [embed], allowedMentions: NO_PING });
  await message.delete().catch(() => {});
}

export async function handleDm(message: Message): Promise<void> {
  if (!message.guild) return;
  const mod = message.guild.members.cache.get(message.author.id);
  if (!mod?.permissions.has(PermissionFlagsBits.ManageGuild)) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ You need **Manage Server** permission.")] });
    return;
  }

  const target = message.mentions.members?.first();
  if (!target) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Usage: `!dm @user <message>`")] });
    return;
  }

  const text = message.content.trim()
    .replace(/^!dm\s*/i, "")
    .replace(/<@!?\d+>\s*/, "")
    .trim();

  if (!text) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Please provide a message to send.")] });
    return;
  }

  try {
    await target.send({
      embeds: [
        new EmbedBuilder()
          .setColor(C)
          .setTitle(`📩 Message from ${message.guild.name}`)
          .setDescription(sanitize(text))
          .setFooter({ text: `Sent by ${message.author.tag}` })
          .setTimestamp(),
      ],
    });
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(`✅ DM sent to **${target.displayName}**.`)] });
  } catch {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Could not DM that user. They may have DMs disabled.")] });
  }
}
