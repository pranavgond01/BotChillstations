import {
  EmbedBuilder,
  PermissionFlagsBits,
  type Message,
  type GuildMember,
  type TextChannel,
} from "discord.js";
import { db } from "@workspace/db";
import { welcomeConfigsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const DEFAULT_MSG = "👋 Welcome to **{server}**, {user}! You're member **#{count}**. Enjoy your stay!";

interface WelcomeConfig { channelId: string; message: string; }

function resolveMessage(template: string, member: GuildMember): string {
  return template
    .replace(/{user}/g, `<@${member.id}>`)
    .replace(/{username}/g, member.user.username)
    .replace(/{server}/g, member.guild.name)
    .replace(/{count}/g, String(member.guild.memberCount));
}

export async function getWelcomeConfig(guildId: string): Promise<WelcomeConfig | null> {
  const rows = await db.select().from(welcomeConfigsTable).where(eq(welcomeConfigsTable.guildId, guildId)).limit(1);
  return rows[0] ? { channelId: rows[0].channelId, message: rows[0].message } : null;
}

export async function upsertWelcomeConfig(guildId: string, channelId: string, message: string): Promise<void> {
  await db.insert(welcomeConfigsTable)
    .values({ guildId, channelId, message })
    .onConflictDoUpdate({ target: welcomeConfigsTable.guildId, set: { channelId, message } });
}

export async function deleteWelcomeConfig(guildId: string): Promise<void> {
  await db.delete(welcomeConfigsTable).where(eq(welcomeConfigsTable.guildId, guildId));
}

export async function handleWelcomeMember(member: GuildMember): Promise<void> {
  const config = await getWelcomeConfig(member.guild.id);
  if (!config) return;
  try {
    const channel = (await member.guild.channels.fetch(config.channelId)) as TextChannel | null;
    if (!channel?.isTextBased()) return;
    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff0000)
          .setDescription(resolveMessage(config.message, member))
          .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
          .setTimestamp(),
      ],
    });
  } catch { /* channel unavailable */ }
}

export async function handleSetWelcome(message: Message): Promise<void> {
  if (!message.guild) return;
  const mod = message.guild.members.cache.get(message.author.id);
  if (!mod?.permissions.has(PermissionFlagsBits.ManageGuild)) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription("❌ You need **Manage Server** permission.")] });
    return;
  }
  const args = message.content.trim().split(/\s+/).slice(1);
  if (args.length === 0) {
    const cur = await getWelcomeConfig(message.guild.id);
    await message.reply({
      embeds: [
        new EmbedBuilder().setColor(0xff0000).setTitle("⚙️ Welcome Setup")
          .setDescription(cur ? `**Channel:** <#${cur.channelId}>\n**Message:**\n\`\`\`${cur.message}\`\`\`` : "No welcome message configured.")
          .addFields({ name: "Commands", value: "`!setwelcome #channel` — set channel\n`!setwelcome message <text>` — set message\n`!setwelcome test` — preview\n`!setwelcome disable` — disable\n\n**Placeholders:** `{user}` `{username}` `{server}` `{count}`" }),
      ],
    });
    return;
  }
  if (args[0].toLowerCase() === "disable") {
    await deleteWelcomeConfig(message.guild.id);
    await message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription("✅ Welcome messages **disabled**.")] });
    return;
  }
  if (args[0].toLowerCase() === "test") {
    const config = await getWelcomeConfig(message.guild.id);
    if (!config) { await message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription("❌ Set a welcome channel first.")] }); return; }
    const fakeMember = message.guild.members.cache.get(message.author.id);
    if (fakeMember) await handleWelcomeMember(fakeMember);
    await message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription(`✅ Preview sent to <#${config.channelId}>.`)] });
    return;
  }
  if (args[0].toLowerCase() === "message") {
    const text = args.slice(1).join(" ");
    if (!text) { await message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription("❌ Usage: `!setwelcome message <text>`")] }); return; }
    const existing = await getWelcomeConfig(message.guild.id);
    await upsertWelcomeConfig(message.guild.id, existing?.channelId ?? message.channelId, text);
    await message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription(`✅ Welcome message updated:\n\`\`\`${text}\`\`\``)] });
    return;
  }
  const channel = message.mentions.channels.first() as TextChannel | undefined;
  if (!channel) { await message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription("❌ Mention a channel: `!setwelcome #channel`")] }); return; }
  const existing = await getWelcomeConfig(message.guild.id);
  await upsertWelcomeConfig(message.guild.id, channel.id, existing?.message ?? DEFAULT_MSG);
  await message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription(`✅ Welcome channel set to ${channel}!\nUse \`!setwelcome message <text>\` to customize. Use \`!setwelcome test\` to preview.`)] });
}
