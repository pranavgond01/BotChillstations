import {
  EmbedBuilder,
  PermissionFlagsBits,
  type Message,
  type GuildMember,
  type TextChannel,
} from "discord.js";
import { db } from "@workspace/db";
import { leaveConfigsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const DEFAULT_MSG = "👋 **{username}** has left **{server}**. We now have **{count}** members.";

interface LeaveConfig { channelId: string; message: string; }

function resolve(template: string, member: GuildMember): string {
  return template
    .replace(/{user}/g, `<@${member.id}>`)
    .replace(/{username}/g, member.user.username)
    .replace(/{server}/g, member.guild.name)
    .replace(/{count}/g, String(member.guild.memberCount));
}

export async function getLeaveConfig(guildId: string): Promise<LeaveConfig | null> {
  const rows = await db.select().from(leaveConfigsTable).where(eq(leaveConfigsTable.guildId, guildId)).limit(1);
  return rows[0] ? { channelId: rows[0].channelId, message: rows[0].message } : null;
}

export async function upsertLeaveConfig(guildId: string, channelId: string, message: string): Promise<void> {
  await db.insert(leaveConfigsTable)
    .values({ guildId, channelId, message })
    .onConflictDoUpdate({ target: leaveConfigsTable.guildId, set: { channelId, message } });
}

export async function deleteLeaveConfig(guildId: string): Promise<void> {
  await db.delete(leaveConfigsTable).where(eq(leaveConfigsTable.guildId, guildId));
}

export async function handleLeaveMember(member: GuildMember): Promise<void> {
  const config = await getLeaveConfig(member.guild.id);
  if (!config) return;
  try {
    const channel = (await member.guild.channels.fetch(config.channelId)) as TextChannel | null;
    if (!channel?.isTextBased()) return;
    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x2b2d31)
          .setDescription(resolve(config.message, member))
          .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
          .setTimestamp(),
      ],
    });
  } catch { /* channel unavailable */ }
}

export async function handleSetLeave(message: Message): Promise<void> {
  if (!message.guild) return;
  const mod = message.guild.members.cache.get(message.author.id);
  if (!mod?.permissions.has(PermissionFlagsBits.ManageGuild)) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription("❌ You need **Manage Server** permission.")] });
    return;
  }
  const args = message.content.trim().split(/\s+/).slice(1);
  if (args.length === 0) {
    const cur = await getLeaveConfig(message.guild.id);
    await message.reply({
      embeds: [
        new EmbedBuilder().setColor(0xff0000).setTitle("⚙️ Leave Message Setup")
          .setDescription(cur ? `**Channel:** <#${cur.channelId}>\n**Message:**\n\`\`\`${cur.message}\`\`\`` : "No leave message configured.")
          .addFields({ name: "Commands", value: "`!setleave #channel` — set channel\n`!setleave message <text>` — set message\n`!setleave test` — preview\n`!setleave disable` — disable\n\n**Placeholders:** `{user}` `{username}` `{server}` `{count}`" }),
      ],
    });
    return;
  }
  if (args[0].toLowerCase() === "disable") {
    await deleteLeaveConfig(message.guild.id);
    await message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription("✅ Leave messages **disabled**.")] });
    return;
  }
  if (args[0].toLowerCase() === "test") {
    const config = await getLeaveConfig(message.guild.id);
    if (!config) { await message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription("❌ Set a leave channel first.")] }); return; }
    const fakeMember = message.guild.members.cache.get(message.author.id);
    if (fakeMember) await handleLeaveMember(fakeMember);
    await message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription(`✅ Preview sent to <#${config.channelId}>.`)] });
    return;
  }
  if (args[0].toLowerCase() === "message") {
    const text = args.slice(1).join(" ");
    if (!text) { await message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription("❌ Usage: `!setleave message <text>`")] }); return; }
    const existing = await getLeaveConfig(message.guild.id);
    await upsertLeaveConfig(message.guild.id, existing?.channelId ?? message.channelId, text);
    await message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription(`✅ Leave message updated:\n\`\`\`${text}\`\`\``)] });
    return;
  }
  const channel = message.mentions.channels.first() as TextChannel | undefined;
  if (!channel) { await message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription("❌ Mention a channel: `!setleave #channel`")] }); return; }
  const existing = await getLeaveConfig(message.guild.id);
  await upsertLeaveConfig(message.guild.id, channel.id, existing?.message ?? DEFAULT_MSG);
  await message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription(`✅ Leave channel set to ${channel}!`)] });
}
