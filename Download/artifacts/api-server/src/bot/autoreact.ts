import {
  EmbedBuilder,
  PermissionFlagsBits,
  type Message,
} from "discord.js";
import { db, autoReactTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";

const cache = new Map<string, Map<string, string[]>>();

export async function initAutoReact(): Promise<void> {
  const rows = await db.select().from(autoReactTable);
  for (const r of rows) {
    if (!cache.has(r.guildId)) cache.set(r.guildId, new Map());
    const gmap = cache.get(r.guildId)!;
    if (!gmap.has(r.channelId)) gmap.set(r.channelId, []);
    gmap.get(r.channelId)!.push(r.emoji);
  }
}

export async function handleAutoReactOnMessage(message: Message): Promise<void> {
  if (!message.guild || message.author.bot) return;
  const gmap = cache.get(message.guild.id);
  if (!gmap) return;
  const emojis = gmap.get(message.channelId);
  if (!emojis || emojis.length === 0) return;
  for (const emoji of emojis) {
    await message.react(emoji).catch(() => {});
  }
}

export async function handleAutoReact(message: Message): Promise<void> {
  if (!message.guild) return;
  if (!message.member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription("❌ You need **Manage Server** permission.")] });
    return;
  }

  const rawArgs = message.content.trim().split(/\s+/).slice(1);
  const sub = rawArgs[0]?.toLowerCase();

  if (sub === "set" || sub === "add") {
    const mentionedChannel = message.mentions.channels.first();
    const channelId = mentionedChannel?.id ?? message.channelId;
    const emoji = mentionedChannel ? rawArgs[2] : rawArgs[1];
    if (!emoji) {
      await message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription("❌ Usage: `!autoreact set [#channel] <emoji>`")] });
      return;
    }
    if (!cache.has(message.guild.id)) cache.set(message.guild.id, new Map());
    const gmap = cache.get(message.guild.id)!;
    if (!gmap.has(channelId)) gmap.set(channelId, []);
    if (!gmap.get(channelId)!.includes(emoji)) {
      gmap.get(channelId)!.push(emoji);
      await db.insert(autoReactTable)
        .values({ guildId: message.guild.id, channelId, emoji })
        .onConflictDoNothing();
    }
    await message.reply({ embeds: [new EmbedBuilder().setColor(0x57f287).setDescription(`✅ Auto react ${emoji} added to <#${channelId}>.`)] });
    return;
  }

  if (sub === "remove") {
    const mentionedChannel = message.mentions.channels.first();
    const channelId = mentionedChannel?.id ?? message.channelId;
    const emoji = mentionedChannel ? rawArgs[2] : rawArgs[1];
    const guildId = message.guild.id;
    if (emoji) {
      const arr = cache.get(guildId)?.get(channelId);
      if (arr) {
        const idx = arr.indexOf(emoji);
        if (idx !== -1) arr.splice(idx, 1);
      }
      await db.delete(autoReactTable).where(and(eq(autoReactTable.channelId, channelId), eq(autoReactTable.emoji, emoji)));
      await message.reply({ embeds: [new EmbedBuilder().setColor(0x57f287).setDescription(`✅ Removed ${emoji} auto react from <#${channelId}>.`)] });
    } else {
      cache.get(guildId)?.delete(channelId);
      await db.delete(autoReactTable).where(and(eq(autoReactTable.guildId, guildId), eq(autoReactTable.channelId, channelId)));
      await message.reply({ embeds: [new EmbedBuilder().setColor(0x57f287).setDescription(`✅ All auto reacts removed from <#${channelId}>.`)] });
    }
    return;
  }

  if (sub === "list") {
    const gmap = cache.get(message.guild.id);
    if (!gmap || gmap.size === 0) {
      await message.reply({ embeds: [new EmbedBuilder().setColor(0x5865f2).setDescription("No auto reacts configured.")] });
      return;
    }
    const lines = [...gmap.entries()].map(([chId, emojis]) => `<#${chId}>: ${emojis.join("  ")}`);
    await message.reply({ embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle("⚡ Auto React").setDescription(lines.join("\n"))] });
    return;
  }

  await message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("⚡ Auto React")
        .setDescription(
          "`!autoreact set [#channel] <emoji>` — add auto react to a channel\n" +
          "`!autoreact remove [#channel] [emoji]` — remove auto react\n" +
          "`!autoreact list` — list all auto reacts",
        ),
    ],
  });
}
