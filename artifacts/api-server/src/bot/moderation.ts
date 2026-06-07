import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  PermissionFlagsBits,
  type Message,
  type TextChannel,
  type GuildMember,
  type Client,
} from "discord.js";
import { logCase } from "./cases";

const C = 0xff0000;

export async function handleKick(client: Client, message: Message): Promise<void> {
  if (!message.guild) return;
  const mod = message.guild.members.cache.get(message.author.id);
  if (!mod?.permissions.has(PermissionFlagsBits.KickMembers)) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ You need **Kick Members** permission.")] });
    return;
  }
  const args = message.content.trim().split(/\s+/).slice(1);
  const target = message.mentions.members?.first() ?? (args[0] ? message.guild.members.cache.get(args[0]) : null);
  if (!target) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Usage: `!kick @user [reason]`")] });
    return;
  }
  if (!target.kickable) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ I cannot kick that member. Make sure my role is above theirs.")] });
    return;
  }
  if (target.id === message.author.id) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ You cannot kick yourself.")] });
    return;
  }
  const reason = args.slice(1).join(" ") || "No reason provided";
  try {
    await target.send({ embeds: [new EmbedBuilder().setColor(C).setTitle(`🥾 You were kicked from ${message.guild.name}`).addFields({ name: "Reason", value: reason })] }).catch(() => {});
    await target.kick(reason);
    const c = await logCase(client, { type: "KICK", guildId: message.guild.id, targetId: target.id, targetTag: target.user.tag, moderatorId: message.author.id, reason });
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(`✅ **${target.user.username}** has been kicked. | Case **#${c.id}**\n**Reason:** ${reason}`)] });
  } catch {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Failed to kick that member.")] });
  }
}

export async function handleBan(client: Client, message: Message): Promise<void> {
  if (!message.guild) return;
  const mod = message.guild.members.cache.get(message.author.id);
  if (!mod?.permissions.has(PermissionFlagsBits.BanMembers)) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ You need **Ban Members** permission.")] });
    return;
  }
  const args = message.content.trim().split(/\s+/).slice(1);
  const target = message.mentions.members?.first() ?? (args[0] ? message.guild.members.cache.get(args[0]) : null);
  if (!target) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Usage: `!ban @user [reason]`")] });
    return;
  }
  if (!target.bannable) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ I cannot ban that member.")] });
    return;
  }
  if (target.id === message.author.id) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ You cannot ban yourself.")] });
    return;
  }
  const reason = args.slice(1).join(" ") || "No reason provided";
  try {
    await target.send({ embeds: [new EmbedBuilder().setColor(C).setTitle(`🔨 You were banned from ${message.guild.name}`).addFields({ name: "Reason", value: reason })] }).catch(() => {});
    await target.ban({ reason });
    const c = await logCase(client, { type: "BAN", guildId: message.guild.id, targetId: target.id, targetTag: target.user.tag, moderatorId: message.author.id, reason });
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(`✅ **${target.user.username}** has been banned. | Case **#${c.id}**\n**Reason:** ${reason}`)] });
  } catch {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Failed to ban that member.")] });
  }
}

export async function handleUnban(client: Client, message: Message): Promise<void> {
  if (!message.guild) return;
  const mod = message.guild.members.cache.get(message.author.id);
  if (!mod?.permissions.has(PermissionFlagsBits.BanMembers)) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ You need **Ban Members** permission.")] });
    return;
  }
  const args = message.content.trim().split(/\s+/).slice(1);
  const userId = args[0];
  if (!userId) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Usage: `!unban <user_id>`")] });
    return;
  }
  try {
    const ban = await message.guild.bans.fetch(userId).catch(() => null);
    const targetTag = ban?.user.tag ?? userId;
    await message.guild.bans.remove(userId);
    const c = await logCase(client, { type: "UNBAN", guildId: message.guild.id, targetId: userId, targetTag, moderatorId: message.author.id, reason: "Manual unban" });
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(`✅ User \`${targetTag}\` has been unbanned. | Case **#${c.id}**`)] });
  } catch {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Could not unban that user. Make sure the ID is correct.")] });
  }
}

export async function handleNuke(message: Message): Promise<void> {
  if (!message.guild) return;
  const mod = message.guild.members.cache.get(message.author.id);
  if (!mod?.permissions.has(PermissionFlagsBits.ManageChannels)) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ You need **Manage Channels** permission.")] });
    return;
  }

  const channel = message.channel as TextChannel;

  const confirmMsg = await message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x2b2d31)
        .setDescription(
          "**Do you really want to nuke the channel?**\n" +
          "Please click either 'Confirm' or 'Cancel' to proceed. You have 30 seconds to decide!"
        ),
    ],
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("nuke_confirm")
          .setLabel("Confirm")
          .setEmoji("✅")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId("nuke_cancel")
          .setLabel("Cancel")
          .setEmoji("❌")
          .setStyle(ButtonStyle.Danger),
      ),
    ],
  });

  const collector = confirmMsg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 30_000,
    filter: (i) => i.user.id === message.author.id,
    max: 1,
  });

  collector.on("collect", async (interaction) => {
    if (interaction.customId === "nuke_cancel") {
      await interaction.update({
        embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Nuke cancelled.")],
        components: [],
      });
      return;
    }
    await interaction.deferUpdate();
    try {
      const position = channel.position;
      const newChannel = await channel.clone({ reason: `Nuke by ${message.author.tag}` });
      await newChannel.setPosition(position);
      await channel.delete();
      await newChannel.send({ embeds: [new EmbedBuilder().setColor(C).setDescription("💥 Channel has been nuked.")] });
    } catch {
      await (message.channel as TextChannel).send({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Failed to nuke channel.")] }).catch(() => {});
    }
  });

  collector.on("end", async (_c, reason) => {
    if (reason === "time") {
      await confirmMsg.edit({
        embeds: [new EmbedBuilder().setColor(C).setDescription("⏰ Nuke confirmation timed out.")],
        components: [],
      }).catch(() => {});
    }
  });
}

export async function handleSlowmode(message: Message): Promise<void> {
  if (!message.guild) return;
  const mod = message.guild.members.cache.get(message.author.id);
  if (!mod?.permissions.has(PermissionFlagsBits.ManageChannels)) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ You need **Manage Channels** permission.")] });
    return;
  }
  const args = message.content.trim().split(/\s+/).slice(1);
  const seconds = parseInt(args[0]);
  if (isNaN(seconds) || seconds < 0 || seconds > 21600) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Usage: `!slowmode <seconds>` (0–21600)")] });
    return;
  }
  try {
    await (message.channel as TextChannel).setRateLimitPerUser(seconds);
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(seconds === 0 ? "✅ Slowmode disabled." : `✅ Slowmode set to **${seconds}s**.`)] });
  } catch {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Failed to set slowmode.")] });
  }
}

export async function handleLock(message: Message): Promise<void> {
  if (!message.guild) return;
  const mod = message.guild.members.cache.get(message.author.id);
  if (!mod?.permissions.has(PermissionFlagsBits.ManageChannels)) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ You need **Manage Channels** permission.")] });
    return;
  }
  try {
    await (message.channel as TextChannel).permissionOverwrites.edit(message.guild.id, { SendMessages: false });
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("🔒 Channel locked. Members cannot send messages.")] });
  } catch {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Failed to lock channel.")] });
  }
}

export async function handleUnlock(message: Message): Promise<void> {
  if (!message.guild) return;
  const mod = message.guild.members.cache.get(message.author.id);
  if (!mod?.permissions.has(PermissionFlagsBits.ManageChannels)) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ You need **Manage Channels** permission.")] });
    return;
  }
  try {
    await (message.channel as TextChannel).permissionOverwrites.edit(message.guild.id, { SendMessages: null });
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("🔓 Channel unlocked.")] });
  } catch {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Failed to unlock channel.")] });
  }
}

// ── !softban ───────────────────────────────────────────────────────────────────
export async function handleSoftban(client: Client, message: Message): Promise<void> {
  if (!message.guild) return;
  const mod = message.guild.members.cache.get(message.author.id);
  if (!mod?.permissions.has(PermissionFlagsBits.BanMembers)) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ You need **Ban Members** permission.")] });
    return;
  }
  const args = message.content.trim().split(/\s+/).slice(1);
  const targetId = args[0]?.replace(/[<@!>]/g, "");
  const reason = args.slice(1).join(" ") || "No reason provided";
  if (!targetId) { await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Usage: `!softban @user [reason]`")] }); return; }
  const target = message.guild.members.cache.get(targetId) ?? await message.guild.members.fetch(targetId).catch(() => null);
  if (!target) { await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Member not found.")] }); return; }
  try {
    await message.guild.bans.create(target.id, { deleteMessageDays: 1, reason: `[Softban] ${reason}` });
    await message.guild.bans.remove(target.id, "Softban - auto unban");
    await logCase(client, { type: "BAN", guildId: message.guild.id, targetId: target.id, targetTag: target.user.tag, moderatorId: message.author.id, reason: `[Softban] ${reason}` });
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(`✅ **${target.user.tag}** has been softbanned. Messages deleted, they can rejoin.`)] });
  } catch {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Failed to softban. Check my permissions.")] });
  }
}

// ── !hackban ───────────────────────────────────────────────────────────────────
export async function handleHackban(client: Client, message: Message): Promise<void> {
  if (!message.guild) return;
  const mod = message.guild.members.cache.get(message.author.id);
  if (!mod?.permissions.has(PermissionFlagsBits.BanMembers)) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ You need **Ban Members** permission.")] });
    return;
  }
  const args = message.content.trim().split(/\s+/).slice(1);
  const userId = args[0];
  const reason = args.slice(1).join(" ") || "No reason provided";
  if (!userId || !/^\d+$/.test(userId)) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Usage: `!hackban <user_id> [reason]`")] });
    return;
  }
  try {
    const user = await client.users.fetch(userId);
    await message.guild.bans.create(userId, { reason: `[Hackban] ${reason}` });
    await logCase(client, { type: "BAN", guildId: message.guild!.id, targetId: user.id, targetTag: user.tag, moderatorId: message.author.id, reason: `[Hackban] ${reason}` });
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(`✅ **${user.tag}** has been hackbanned (not in server).`)] });
  } catch {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Failed to ban. Check my permissions or the ID.")] });
  }
}

// ── !voicemute / !voiceunmute ─────────────────────────────────────────────────
export async function handleVoiceMute(message: Message): Promise<void> {
  if (!message.guild) return;
  const mod = message.guild.members.cache.get(message.author.id);
  if (!mod?.permissions.has(PermissionFlagsBits.MuteMembers)) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ You need **Mute Members** permission.")] });
    return;
  }
  const targetId = message.content.trim().split(/\s+/)[1]?.replace(/[<@!>]/g, "");
  if (!targetId) { await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Usage: `!vmute @user`")] }); return; }
  const target = message.guild.members.cache.get(targetId) ?? await message.guild.members.fetch(targetId).catch(() => null) as GuildMember | null;
  if (!target) { await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Member not found.")] }); return; }
  if (!target.voice.channel) { await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ That member is not in a voice channel.")] }); return; }
  try {
    await target.voice.setMute(true);
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(`🔇 Server-muted **${target.displayName}** in voice.`)] });
  } catch { await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Failed to mute.")] }); }
}

export async function handleVoiceUnmute(message: Message): Promise<void> {
  if (!message.guild) return;
  const mod = message.guild.members.cache.get(message.author.id);
  if (!mod?.permissions.has(PermissionFlagsBits.MuteMembers)) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ You need **Mute Members** permission.")] });
    return;
  }
  const targetId = message.content.trim().split(/\s+/)[1]?.replace(/[<@!>]/g, "");
  if (!targetId) { await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Usage: `!vunmute @user`")] }); return; }
  const target = message.guild.members.cache.get(targetId) ?? await message.guild.members.fetch(targetId).catch(() => null) as GuildMember | null;
  if (!target) { await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Member not found.")] }); return; }
  try {
    await target.voice.setMute(false);
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(`🔊 Removed server-mute from **${target.displayName}**.`)] });
  } catch { await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Failed to unmute.")] }); }
}

// ── !deafen / !undeafen ────────────────────────────────────────────────────────
export async function handleDeafen(message: Message): Promise<void> {
  if (!message.guild) return;
  const mod = message.guild.members.cache.get(message.author.id);
  if (!mod?.permissions.has(PermissionFlagsBits.DeafenMembers)) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ You need **Deafen Members** permission.")] });
    return;
  }
  const targetId = message.content.trim().split(/\s+/)[1]?.replace(/[<@!>]/g, "");
  if (!targetId) { await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Usage: `!deafen @user`")] }); return; }
  const target = message.guild.members.cache.get(targetId) ?? await message.guild.members.fetch(targetId).catch(() => null) as GuildMember | null;
  if (!target?.voice.channel) { await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Member not in voice or not found.")] }); return; }
  try {
    await target.voice.setDeaf(true);
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(`🔕 Server-deafened **${target.displayName}**.`)] });
  } catch { await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Failed to deafen.")] }); }
}

export async function handleUndeafen(message: Message): Promise<void> {
  if (!message.guild) return;
  const mod = message.guild.members.cache.get(message.author.id);
  if (!mod?.permissions.has(PermissionFlagsBits.DeafenMembers)) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ You need **Deafen Members** permission.")] });
    return;
  }
  const targetId = message.content.trim().split(/\s+/)[1]?.replace(/[<@!>]/g, "");
  if (!targetId) { await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Usage: `!undeafen @user`")] }); return; }
  const target = message.guild.members.cache.get(targetId) ?? await message.guild.members.fetch(targetId).catch(() => null) as GuildMember | null;
  if (!target) { await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Member not found.")] }); return; }
  try {
    await target.voice.setDeaf(false);
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(`🔔 Removed server-deafen from **${target.displayName}**.`)] });
  } catch { await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Failed to undeafen.")] }); }
}

// ── !move ──────────────────────────────────────────────────────────────────────
export async function handleMove(message: Message): Promise<void> {
  if (!message.guild) return;
  const mod = message.guild.members.cache.get(message.author.id);
  if (!mod?.permissions.has(PermissionFlagsBits.MoveMembers)) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ You need **Move Members** permission.")] });
    return;
  }
  const args = message.content.trim().split(/\s+/).slice(1);
  const targetId = args[0]?.replace(/[<@!>]/g, "");
  const channelId = message.mentions.channels.first()?.id ?? args[1]?.replace(/[<#>]/g, "");
  if (!targetId || !channelId) { await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Usage: `!move @user #voice-channel`")] }); return; }
  const target = message.guild.members.cache.get(targetId) ?? await message.guild.members.fetch(targetId).catch(() => null) as GuildMember | null;
  if (!target?.voice.channel) { await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Member not in voice or not found.")] }); return; }
  const vc = message.guild.channels.cache.get(channelId);
  if (!vc) { await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Voice channel not found.")] }); return; }
  try {
    await target.voice.setChannel(channelId);
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(`✅ Moved **${target.displayName}** to **${vc.name}**.`)] });
  } catch { await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Failed to move.")] }); }
}

// ── !voicekick ─────────────────────────────────────────────────────────────────
export async function handleVoiceKick(message: Message): Promise<void> {
  if (!message.guild) return;
  const mod = message.guild.members.cache.get(message.author.id);
  if (!mod?.permissions.has(PermissionFlagsBits.MoveMembers)) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ You need **Move Members** permission.")] });
    return;
  }
  const targetId = message.content.trim().split(/\s+/)[1]?.replace(/[<@!>]/g, "");
  if (!targetId) { await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Usage: `!voicekick @user`")] }); return; }
  const target = message.guild.members.cache.get(targetId) ?? await message.guild.members.fetch(targetId).catch(() => null) as GuildMember | null;
  if (!target?.voice.channel) { await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Member not in voice or not found.")] }); return; }
  try {
    await target.voice.disconnect();
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(`✅ Disconnected **${target.displayName}** from voice.`)] });
  } catch { await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Failed to disconnect.")] }); }
}

// ── !banlist ───────────────────────────────────────────────────────────────────
export async function handleBanList(message: Message): Promise<void> {
  if (!message.guild) return;
  const mod = message.guild.members.cache.get(message.author.id);
  if (!mod?.permissions.has(PermissionFlagsBits.BanMembers)) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ You need **Ban Members** permission.")] });
    return;
  }
  const bans = await message.guild.bans.fetch();
  if (bans.size === 0) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("✅ No users are banned in this server.")] });
    return;
  }
  const list = bans.first(20).map((b) => `• **${b.user.tag}** (\`${b.user.id}\`) — ${b.reason ?? "No reason"}`).join("\n");
  await message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(C)
        .setTitle(`🔨 Ban List — ${bans.size} ban${bans.size !== 1 ? "s" : ""}`)
        .setDescription(list + (bans.size > 20 ? `\n\n*...and ${bans.size - 20} more*` : "")),
    ],
  });
}

// ── !clearreactions ────────────────────────────────────────────────────────────
export async function handleClearReactions(message: Message): Promise<void> {
  if (!message.guild) return;
  const mod = message.guild.members.cache.get(message.author.id);
  if (!mod?.permissions.has(PermissionFlagsBits.ManageMessages)) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ You need **Manage Messages** permission.")] });
    return;
  }
  const msgId = message.content.trim().split(/\s+/)[1];
  if (!msgId) { await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Usage: `!clearreactions <message_id>`")] }); return; }
  const target = await (message.channel as TextChannel).messages.fetch(msgId).catch(() => null);
  if (!target) { await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Message not found in this channel.")] }); return; }
  try {
    await target.reactions.removeAll();
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("✅ Cleared all reactions from that message.")] });
  } catch { await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Failed to clear reactions.")] }); }
}
