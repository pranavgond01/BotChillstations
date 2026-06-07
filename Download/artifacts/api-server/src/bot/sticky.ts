import {
  EmbedBuilder,
  PermissionFlagsBits,
  type Message,
  type TextChannel,
} from "discord.js";
import { db, stickyMessagesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

interface StickyEntry { content: string; messageId: string | null; guildId: string; }

const cache = new Map<string, StickyEntry>();

export async function initStickyMessages(): Promise<void> {
  const rows = await db.select().from(stickyMessagesTable);
  for (const r of rows) {
    cache.set(r.channelId, { content: r.content, messageId: r.messageId ?? null, guildId: r.guildId });
  }
}

export async function handleStickyOnMessage(message: Message): Promise<void> {
  if (!message.guild || message.author.bot) return;
  const entry = cache.get(message.channelId);
  if (!entry) return;
  if (message.id === entry.messageId) return;

  const ch = message.channel as TextChannel;
  if (entry.messageId) {
    await ch.messages.delete(entry.messageId).catch(() => {});
  }
  const newMsg = await ch.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle("📌 Sticky Message")
        .setDescription(entry.content),
    ],
  }).catch(() => null);
  if (newMsg) {
    entry.messageId = newMsg.id;
    await db.insert(stickyMessagesTable)
      .values({ guildId: entry.guildId, channelId: message.channelId, content: entry.content, messageId: newMsg.id })
      .onConflictDoUpdate({ target: stickyMessagesTable.channelId, set: { messageId: newMsg.id } })
      .catch(() => {});
  }
}

export async function handleSticky(message: Message): Promise<void> {
  if (!message.guild) return;
  if (!message.member?.permissions.has(PermissionFlagsBits.ManageMessages)) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription("❌ You need **Manage Messages** permission.")] });
    return;
  }
  const args = message.content.trim().split(/\s+/).slice(1);
  const sub = args[0]?.toLowerCase();

  if (sub === "set") {
    const content = args.slice(1).join(" ");
    if (!content) {
      await message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription("❌ Usage: `!sticky set <message>`")] });
      return;
    }
    const existing = cache.get(message.channelId);
    if (existing?.messageId) {
      await (message.channel as TextChannel).messages.delete(existing.messageId).catch(() => {});
    }
    const stickyMsg = await (message.channel as TextChannel).send({
      embeds: [new EmbedBuilder().setColor(0xf1c40f).setTitle("📌 Sticky Message").setDescription(content)],
    });
    const entry: StickyEntry = { content, messageId: stickyMsg.id, guildId: message.guild.id };
    cache.set(message.channelId, entry);
    await db.insert(stickyMessagesTable)
      .values({ guildId: message.guild.id, channelId: message.channelId, content, messageId: stickyMsg.id })
      .onConflictDoUpdate({ target: stickyMessagesTable.channelId, set: { content, messageId: stickyMsg.id } });
    await message.reply({ embeds: [new EmbedBuilder().setColor(0x57f287).setDescription("✅ Sticky message set for this channel.")] });
    return;
  }

  if (sub === "remove") {
    const existing = cache.get(message.channelId);
    if (!existing) {
      await message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription("❌ No sticky message in this channel.")] });
      return;
    }
    if (existing.messageId) await (message.channel as TextChannel).messages.delete(existing.messageId).catch(() => {});
    cache.delete(message.channelId);
    await db.delete(stickyMessagesTable).where(eq(stickyMessagesTable.channelId, message.channelId));
    await message.reply({ embeds: [new EmbedBuilder().setColor(0x57f287).setDescription("✅ Sticky message removed from this channel.")] });
    return;
  }

  if (sub === "list") {
    const entries = [...cache.entries()].filter(([, e]) => e.guildId === message.guild!.id);
    if (entries.length === 0) {
      await message.reply({ embeds: [new EmbedBuilder().setColor(0x5865f2).setDescription("No sticky messages in this server.")] });
      return;
    }
    const lines = entries.map(([chId, e]) => `<#${chId}> — ${e.content.slice(0, 60)}${e.content.length > 60 ? "…" : ""}`);
    await message.reply({ embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle("📌 Sticky Messages").setDescription(lines.join("\n"))] });
    return;
  }

  await message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("📌 Sticky Message")
        .setDescription(
          "`!sticky set <message>` — pin a sticky to this channel\n" +
          "`!sticky remove` — remove the sticky from this channel\n" +
          "`!sticky list` — list all sticky messages in this server",
        ),
    ],
  });
}
