import {
  EmbedBuilder,
  PermissionFlagsBits,
  type Message,
  type Client,
  type TextChannel,
} from "discord.js";
import { db } from "@workspace/db";
import { modCasesTable, modlogChannelsTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";

const C = 0xff0000;

export type CaseType = "WARN" | "MUTE" | "UNMUTE" | "KICK" | "BAN" | "UNBAN";

export interface ModerationCase {
  id: number;
  type: CaseType;
  guildId: string;
  targetId: string;
  targetTag: string;
  moderatorId: string;
  reason: string;
  timestamp: number;
}

export const CASE_COLORS: Record<CaseType, number> = {
  WARN: 0xffa500, MUTE: 0xff6600, UNMUTE: 0x57f287,
  KICK: 0xff4444, BAN: 0xff0000, UNBAN: 0x57f287,
};

export const CASE_EMOJIS: Record<CaseType, string> = {
  WARN: "⚠️", MUTE: "🔇", UNMUTE: "🔊", KICK: "🥾", BAN: "🔨", UNBAN: "🔓",
};

export async function setModlogChannel(guildId: string, channelId: string): Promise<void> {
  await db.insert(modlogChannelsTable)
    .values({ guildId, channelId })
    .onConflictDoUpdate({ target: modlogChannelsTable.guildId, set: { channelId } });
}

export async function getModlogChannel(guildId: string): Promise<string | null> {
  const rows = await db.select().from(modlogChannelsTable).where(eq(modlogChannelsTable.guildId, guildId)).limit(1);
  return rows[0]?.channelId ?? null;
}

export async function getCase(guildId: string, caseId: number): Promise<ModerationCase | null> {
  const rows = await db.select().from(modCasesTable)
    .where(and(eq(modCasesTable.guildId, guildId), eq(modCasesTable.caseId, caseId)))
    .limit(1);
  if (!rows[0]) return null;
  const r = rows[0];
  return { id: r.caseId, type: r.type as CaseType, guildId: r.guildId, targetId: r.targetId, targetTag: r.targetTag, moderatorId: r.moderatorId, reason: r.reason, timestamp: r.timestamp };
}

export async function getRecentCases(guildId: string, targetId: string | null, limit = 10): Promise<ModerationCase[]> {
  const rows = await db.select().from(modCasesTable)
    .where(targetId
      ? and(eq(modCasesTable.guildId, guildId), eq(modCasesTable.targetId, targetId))
      : eq(modCasesTable.guildId, guildId))
    .orderBy(desc(modCasesTable.caseId))
    .limit(limit);
  return rows.map((r) => ({ id: r.caseId, type: r.type as CaseType, guildId: r.guildId, targetId: r.targetId, targetTag: r.targetTag, moderatorId: r.moderatorId, reason: r.reason, timestamp: r.timestamp }));
}

export async function logCase(
  client: Client,
  data: Omit<ModerationCase, "id" | "timestamp">
): Promise<ModerationCase> {
  const lastRows = await db.select({ caseId: modCasesTable.caseId })
    .from(modCasesTable)
    .where(eq(modCasesTable.guildId, data.guildId))
    .orderBy(desc(modCasesTable.caseId))
    .limit(1);
  const id = lastRows[0] ? lastRows[0].caseId + 1 : 1;
  const c: ModerationCase = { ...data, id, timestamp: Date.now() };

  await db.insert(modCasesTable).values({
    caseId: c.id, guildId: c.guildId, type: c.type,
    targetId: c.targetId, targetTag: c.targetTag,
    moderatorId: c.moderatorId, reason: c.reason, timestamp: c.timestamp,
  });

  const channelId = await getModlogChannel(data.guildId);
  if (channelId) {
    try {
      const channel = await client.channels.fetch(channelId) as TextChannel | null;
      if (channel?.isTextBased()) {
        await channel.send({
          embeds: [
            new EmbedBuilder()
              .setColor(CASE_COLORS[c.type])
              .setTitle(`${CASE_EMOJIS[c.type]} Case #${c.id} — ${c.type}`)
              .addFields(
                { name: "Member", value: `<@${c.targetId}> \`${c.targetTag}\``, inline: true },
                { name: "Moderator", value: `<@${c.moderatorId}>`, inline: true },
                { name: "Reason", value: c.reason, inline: false },
              )
              .setFooter({ text: `Case ID: ${c.id}` })
              .setTimestamp(c.timestamp),
          ],
        });
      }
    } catch { /* modlog unavailable */ }
  }
  return c;
}

export async function handleSetModlog(message: Message): Promise<void> {
  if (!message.guild) return;
  const mod = message.guild.members.cache.get(message.author.id);
  if (!mod?.permissions.has(PermissionFlagsBits.ManageGuild)) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ You need **Manage Server** permission.")] });
    return;
  }
  const channel = message.mentions.channels.first() as TextChannel | undefined;
  if (!channel) {
    const cur = await getModlogChannel(message.guild.id);
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(cur ? `📋 Current mod-log channel: <#${cur}>` : "❌ Usage: `!setmodlog #channel`")] });
    return;
  }
  await setModlogChannel(message.guild.id, channel.id);
  await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(`✅ Mod-log channel set to ${channel}.`)] });
}

export async function handleCaseLookup(message: Message): Promise<void> {
  if (!message.guild) return;
  const mod = message.guild.members.cache.get(message.author.id);
  if (!mod?.permissions.has(PermissionFlagsBits.ManageGuild)) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ You need **Manage Server** permission.")] });
    return;
  }
  const id = parseInt(message.content.trim().split(/\s+/)[1]);
  if (isNaN(id)) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Usage: `!case <id>`")] });
    return;
  }
  const c = await getCase(message.guild.id, id);
  if (!c) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(`❌ Case **#${id}** not found.`)] });
    return;
  }
  await message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(CASE_COLORS[c.type])
        .setTitle(`${CASE_EMOJIS[c.type]} Case #${c.id} — ${c.type}`)
        .addFields(
          { name: "Member", value: `<@${c.targetId}> \`${c.targetTag}\``, inline: true },
          { name: "Moderator", value: `<@${c.moderatorId}>`, inline: true },
          { name: "Reason", value: c.reason, inline: false },
          { name: "Date", value: `<t:${Math.floor(c.timestamp / 1000)}:F>`, inline: false },
        )
        .setFooter({ text: `Case #${c.id}` })
        .setTimestamp(c.timestamp),
    ],
  });
}

export async function handleCaseList(message: Message): Promise<void> {
  if (!message.guild) return;
  const mod = message.guild.members.cache.get(message.author.id);
  if (!mod?.permissions.has(PermissionFlagsBits.ManageGuild)) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ You need **Manage Server** permission.")] });
    return;
  }
  const target = message.mentions.members?.first() ??
    (message.content.trim().split(/\s+/)[1] ? message.guild.members.cache.get(message.content.trim().split(/\s+/)[1]) : null);
  const cases = await getRecentCases(message.guild.id, target?.id ?? null, 10);
  if (cases.length === 0) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(target ? `✅ No cases for **${target.user.username}**.` : "✅ No cases found.")] });
    return;
  }
  const list = cases.map((c) =>
    `\`#${c.id}\` ${CASE_EMOJIS[c.type]} **${c.type}** — <@${c.targetId}> by <@${c.moderatorId}> — ${c.reason.slice(0, 40)}${c.reason.length > 40 ? "…" : ""} <t:${Math.floor(c.timestamp / 1000)}:R>`
  ).join("\n");
  await message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(C)
        .setTitle(target ? `📋 Cases for ${target.user.username}` : "📋 Recent Cases")
        .setDescription(list)
        .setFooter({ text: `${cases.length} most recent` })
        .setTimestamp(),
    ],
  });
}
