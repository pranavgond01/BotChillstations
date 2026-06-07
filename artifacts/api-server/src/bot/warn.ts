import { EmbedBuilder, PermissionFlagsBits, type Message, type Client } from "discord.js";
import { logCase } from "./cases";
import { db } from "@workspace/db";
import { warningsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

export interface Warning {
  id: number;
  reason: string;
  moderatorId: string;
  timestamp: number;
}

export async function addWarningToDb(guildId: string, userId: string, moderatorId: string, reason: string): Promise<void> {
  await db.insert(warningsTable).values({ guildId, userId, moderatorId, reason, timestamp: Date.now() });
}

export async function getWarningsFromDb(guildId: string, userId: string): Promise<Warning[]> {
  const rows = await db.select().from(warningsTable)
    .where(and(eq(warningsTable.guildId, guildId), eq(warningsTable.userId, userId)));
  return rows.map((r) => ({ id: r.id, reason: r.reason, moderatorId: r.moderatorId, timestamp: r.timestamp }));
}

export async function clearWarningsFromDb(guildId: string, userId: string): Promise<void> {
  await db.delete(warningsTable).where(and(eq(warningsTable.guildId, guildId), eq(warningsTable.userId, userId)));
}

export async function handleWarn(client: Client, message: Message): Promise<void> {
  if (!message.guild) return;
  const member = message.guild.members.cache.get(message.author.id);
  if (!member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription("❌ You need the **Manage Server** permission to warn members.")] });
    return;
  }
  const args = message.content.trim().split(/\s+/).slice(1);
  if (args.length === 0) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setTitle("Command: !warn").setDescription("**Usage:** `!warn @user [reason]`")] });
    return;
  }
  const target = message.mentions.members?.first() ?? message.guild.members.cache.get(args[0]);
  if (!target) { await message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription("❌ Could not find that member.")] }); return; }
  if (target.user.bot) { await message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription("❌ You cannot warn a bot.")] }); return; }
  if (target.id === message.author.id) { await message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription("❌ You cannot warn yourself.")] }); return; }

  const reason = args.slice(1).join(" ") || "No reason provided";
  await addWarningToDb(message.guild.id, target.id, message.author.id, reason);
  const c = await logCase(client, { type: "WARN", guildId: message.guild.id, targetId: target.id, targetTag: target.user.tag, moderatorId: message.author.id, reason });
  await target.send({ embeds: [new EmbedBuilder().setColor(0xffa500).setTitle(`⚠️ You were warned in ${message.guild.name}`).addFields({ name: "Reason", value: reason })] }).catch(() => {});
  const warns = await getWarningsFromDb(message.guild.id, target.id);
  await message.reply({ embeds: [new EmbedBuilder().setColor(0xffa500).setDescription(`⚠️ **${target.user.username}** warned. | Case **#${c.id}**\n**Reason:** ${reason}\n**Total warnings:** ${warns.length}`)] });
}

export async function handleWarnings(message: Message): Promise<void> {
  if (!message.guild) return;
  const member = message.guild.members.cache.get(message.author.id);
  if (!member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription("❌ You need the **Manage Server** permission.")] });
    return;
  }
  const args = message.content.trim().split(/\s+/).slice(1);
  const target = message.mentions.members?.first() ?? (args[0] ? message.guild.members.cache.get(args[0]) : null);
  if (!target) { await message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription("❌ Usage: `!warnings @user`")] }); return; }
  const userWarnings = await getWarningsFromDb(message.guild.id, target.id);
  if (userWarnings.length === 0) { await message.reply({ embeds: [new EmbedBuilder().setColor(0x57f287).setDescription(`✅ **${target.user.username}** has no warnings.`)] }); return; }
  const list = userWarnings.map((w, i) => `**${i + 1}.** ${w.reason} — <t:${Math.floor(w.timestamp / 1000)}:R> by <@${w.moderatorId}>`).join("\n");
  await message.reply({ embeds: [new EmbedBuilder().setColor(0xffa500).setTitle(`⚠️ Warnings for ${target.user.username}`).setDescription(list).setFooter({ text: `${userWarnings.length} total warning${userWarnings.length !== 1 ? "s" : ""}` })] });
}

export async function handleClearWarnings(message: Message): Promise<void> {
  if (!message.guild) return;
  const member = message.guild.members.cache.get(message.author.id);
  if (!member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription("❌ You need the **Manage Server** permission.")] });
    return;
  }
  const args = message.content.trim().split(/\s+/).slice(1);
  const target = message.mentions.members?.first() ?? (args[0] ? message.guild.members.cache.get(args[0]) : null);
  if (!target) { await message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription("❌ Usage: `!clearwarnings @user`")] }); return; }
  await clearWarningsFromDb(message.guild.id, target.id);
  await message.reply({ embeds: [new EmbedBuilder().setColor(0x57f287).setDescription(`✅ Cleared all warnings for **${target.user.username}**.`)] });
}
