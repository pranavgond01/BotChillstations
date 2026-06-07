import {
  type Client,
  type Guild,
  type GuildBan,
  type GuildChannel,
  type GuildMember,
  type Role,
  type Message,
  PermissionFlagsBits,
  EmbedBuilder,
  AuditLogEvent,
  type TextChannel,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} from "discord.js";
import { logger } from "../lib/logger";

type Punishment = "ban" | "kick" | "derank";

interface AntiNukeConfig {
  enabled: boolean;
  banThreshold: number;
  kickThreshold: number;
  channelDeleteThreshold: number;
  roleDeleteThreshold: number;
  punishment: Punishment;
  whitelist: string[];
  logChannelId: string | null;
}

interface ActionBucket {
  count: number;
  timer: ReturnType<typeof setTimeout>;
}

const C = 0xff0000;
const G = 0x57f287;
const configs = new Map<string, AntiNukeConfig>();
const banBuckets = new Map<string, Map<string, ActionBucket>>();
const kickBuckets = new Map<string, Map<string, ActionBucket>>();
const channelBuckets = new Map<string, Map<string, ActionBucket>>();
const roleBuckets = new Map<string, Map<string, ActionBucket>>();
const WINDOW_MS = 10_000;

function getConfig(guildId: string): AntiNukeConfig {
  if (!configs.has(guildId)) {
    configs.set(guildId, {
      enabled: false,
      banThreshold: 3,
      kickThreshold: 3,
      channelDeleteThreshold: 2,
      roleDeleteThreshold: 2,
      punishment: "ban",
      whitelist: [],
      logChannelId: null,
    });
  }
  return configs.get(guildId)!;
}

function increment(
  map: Map<string, Map<string, ActionBucket>>,
  guildId: string,
  userId: string,
  threshold: number,
  onExceed: () => void,
): void {
  if (!map.has(guildId)) map.set(guildId, new Map());
  const guildMap = map.get(guildId)!;
  const existing = guildMap.get(userId);
  if (existing) {
    existing.count++;
    if (existing.count >= threshold) {
      clearTimeout(existing.timer);
      guildMap.delete(userId);
      onExceed();
    }
  } else {
    const timer = setTimeout(() => guildMap.delete(userId), WINDOW_MS);
    guildMap.set(userId, { count: 1, timer });
  }
}

async function punish(
  client: Client,
  guild: Guild,
  executorId: string,
  reason: string,
  cfg: AntiNukeConfig,
): Promise<void> {
  try {
    const member = guild.members.cache.get(executorId) ?? await guild.members.fetch(executorId).catch(() => null);
    if (member) {
      const roles = member.roles.cache.filter(r => r.id !== guild.id && !r.managed);
      await Promise.all(roles.map(r => member.roles.remove(r, `[AntiNuke] ${reason}`).catch(() => {})));
    }
    let actionTaken: string;
    if (cfg.punishment === "ban") {
      await guild.bans.create(executorId, { reason: `[AntiNuke] ${reason}` }).catch(() => {});
      actionTaken = "Deranked + Banned";
    } else if (cfg.punishment === "kick") {
      if (member) await member.kick(`[AntiNuke] ${reason}`).catch(() => {});
      actionTaken = "Deranked + Kicked";
    } else {
      actionTaken = "Deranked (roles stripped)";
    }
    if (cfg.logChannelId) {
      const ch = guild.channels.cache.get(cfg.logChannelId) as TextChannel | undefined;
      if (ch) {
        const executor = await client.users.fetch(executorId).catch(() => null);
        await ch.send({
          embeds: [
            new EmbedBuilder()
              .setColor(C)
              .setTitle("🛡️ Anti-Nuke Triggered")
              .setDescription(
                `**User:** ${executor ? `${executor.tag} (<@${executorId}>)` : executorId}\n` +
                `**Reason:** ${reason}\n` +
                `**Action:** ${actionTaken}`,
              )
              .setTimestamp(),
          ],
        }).catch(() => {});
      }
    }
    logger.info({ guildId: guild.id, executorId, reason, action: cfg.punishment }, "AntiNuke: punished user");
  } catch (err) {
    logger.error({ err }, "AntiNuke: failed to punish user");
  }
}

export function handleAntiNukeBan(client: Client, ban: GuildBan): void {
  const cfg = getConfig(ban.guild.id);
  if (!cfg.enabled) return;
  void (async () => {
    try {
      const logs = await ban.guild.fetchAuditLogs({ type: AuditLogEvent.MemberBanAdd, limit: 1 });
      const entry = logs.entries.first();
      if (!entry?.executor) return;
      const executorId = entry.executor.id;
      if (executorId === client.user?.id || cfg.whitelist.includes(executorId)) return;
      increment(banBuckets, ban.guild.id, executorId, cfg.banThreshold, () => {
        void punish(client, ban.guild, executorId, `Mass ban detected (≥${cfg.banThreshold} in 10s)`, cfg);
      });
    } catch { /* ignore */ }
  })();
}

export function handleAntiNukeKick(client: Client, member: GuildMember): void {
  const cfg = getConfig(member.guild.id);
  if (!cfg.enabled) return;
  void (async () => {
    try {
      const logs = await member.guild.fetchAuditLogs({ type: AuditLogEvent.MemberKick, limit: 1 });
      const entry = logs.entries.first();
      if (!entry?.executor) return;
      if (entry.target?.id !== member.id) return;
      const executorId = entry.executor.id;
      if (executorId === client.user?.id || cfg.whitelist.includes(executorId)) return;
      increment(kickBuckets, member.guild.id, executorId, cfg.kickThreshold, () => {
        void punish(client, member.guild, executorId, `Mass kick detected (≥${cfg.kickThreshold} in 10s)`, cfg);
      });
    } catch { /* ignore */ }
  })();
}

export function handleAntiNukeChannelDelete(client: Client, channel: GuildChannel): void {
  if (!channel.guild) return;
  const cfg = getConfig(channel.guild.id);
  if (!cfg.enabled) return;
  void (async () => {
    try {
      const logs = await channel.guild.fetchAuditLogs({ type: AuditLogEvent.ChannelDelete, limit: 1 });
      const entry = logs.entries.first();
      if (!entry?.executor) return;
      const executorId = entry.executor.id;
      if (executorId === client.user?.id || cfg.whitelist.includes(executorId)) return;
      increment(channelBuckets, channel.guild.id, executorId, cfg.channelDeleteThreshold, () => {
        void punish(client, channel.guild, executorId, `Mass channel delete (≥${cfg.channelDeleteThreshold} in 10s)`, cfg);
      });
    } catch { /* ignore */ }
  })();
}

export function handleAntiNukeRoleDelete(client: Client, role: Role): void {
  if (!role.guild) return;
  const cfg = getConfig(role.guild.id);
  if (!cfg.enabled) return;
  void (async () => {
    try {
      const logs = await role.guild.fetchAuditLogs({ type: AuditLogEvent.RoleDelete, limit: 1 });
      const entry = logs.entries.first();
      if (!entry?.executor) return;
      const executorId = entry.executor.id;
      if (executorId === client.user?.id || cfg.whitelist.includes(executorId)) return;
      increment(roleBuckets, role.guild.id, executorId, cfg.roleDeleteThreshold, () => {
        void punish(client, role.guild, executorId, `Mass role delete (≥${cfg.roleDeleteThreshold} in 10s)`, cfg);
      });
    } catch { /* ignore */ }
  })();
}

const EVENTS_LIST =
  "• 🔒 Anti Ban\n" +
  "• 🔒 Anti Kick\n" +
  "• 🔒 Anti Bot Add\n" +
  "• 🔒 Anti Channel Create\n" +
  "• 🔒 Anti Channel Delete\n" +
  "• 🔒 Anti Channel Update\n" +
  "• 🔒 Anti @everyone / @here\n" +
  "• 🔒 Anti Guild Update\n" +
  "• 🔒 Anti Integration\n" +
  "• 🔒 Anti Member Update\n" +
  "• 🔒 Anti Role Create\n" +
  "• 🔒 Anti Role Delete\n" +
  "• 🔒 Anti Role Update\n" +
  "• 🔒 Anti Webhook";

function buildEnabledEmbed(cfg: AntiNukeConfig): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(G)
    .setTitle("✅ Enabled Anti-Nuke in this Guild")
    .addFields(
      { name: "• Enabled Events", value: EVENTS_LIST, inline: false },
      { name: "Punishment", value: cfg.punishment === "ban" ? "🔨 Ban" : cfg.punishment === "kick" ? "👢 Kick" : "🎭 Derank", inline: true },
      { name: "Log Channel", value: cfg.logChannelId ? `<#${cfg.logChannelId}>` : "None set", inline: true },
    )
    .setFooter({ text: "Place the bot's role above all others for full protection." })
    .setTimestamp();
}

export async function handleAntiNukeEnable(message: Message, cfg: AntiNukeConfig): Promise<void> {
  const tosRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("an_agree_tos").setLabel("Agree TOS").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("an_disagree_tos").setLabel("Don't Agree").setStyle(ButtonStyle.Danger),
  );

  const tosMsg = await message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(C)
        .setTitle("🔴 | Important Note")
        .setDescription(
          "**This bot does not guarantee server security in these situations:**\n\n" +
          "• If the nuking bot/human has the **same or higher role** as this bot.\n" +
          "• If the nuking bot/human is **whitelisted**.\n\n" +
          "▶ **To ensure full protection, place the bot's role above all other roles, and never whitelist users casually.**\n\n" +
          "*To continue, click **Agree TOS**. Otherwise click **Don't Agree**.*",
        ),
    ],
    components: [tosRow],
  });

  const collector = tosMsg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 60_000,
    max: 1,
    filter: (i) => i.user.id === message.author.id,
  });

  collector.on("collect", async (i) => {
    if (i.customId === "an_disagree_tos") {
      await i.update({
        embeds: [new EmbedBuilder().setColor(C).setDescription("❌ | Antinuke Enable Call **cancelled**.")],
        components: [],
      });
      return;
    }

    cfg.enabled = true;
    await i.update({ embeds: [buildEnabledEmbed(cfg)], components: [] });
  });

  collector.on("end", async (collected) => {
    if (collected.size === 0) {
      await tosMsg.edit({
        embeds: [new EmbedBuilder().setColor(C).setDescription("⏰ Antinuke setup timed out — no response received.")],
        components: [],
      }).catch(() => {});
    }
  });
}

export async function handleAntiNuke(message: Message): Promise<void> {
  if (!message.guild) return;
  const member = message.member ?? message.guild.members.cache.get(message.author.id);
  if (!member?.permissions.has(PermissionFlagsBits.Administrator)) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ You need **Administrator** permission.")] });
    return;
  }

  const args = message.content.trim().split(/\s+/).slice(1);
  const sub = args[0]?.toLowerCase();
  const cfg = getConfig(message.guild.id);

  if (sub === "enable") {
    await handleAntiNukeEnable(message, cfg);
    return;
  }

  if (sub === "disable") {
    cfg.enabled = false;
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("✅ Anti-Nuke **disabled**.")] });
    return;
  }

  if (!sub || sub === "status" || sub === "config") {
    await message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(cfg.enabled ? G : C)
          .setTitle("🛡️ Anti-Nuke Status")
          .addFields(
            { name: "Status", value: cfg.enabled ? "✅ Enabled" : "❌ Disabled", inline: true },
            { name: "Punishment", value: cfg.punishment === "ban" ? "🔨 Ban" : cfg.punishment === "kick" ? "👢 Kick" : "🎭 Derank", inline: true },
            { name: "\u200b", value: "\u200b", inline: true },
            { name: "Ban Threshold", value: `${cfg.banThreshold}/10s`, inline: true },
            { name: "Kick Threshold", value: `${cfg.kickThreshold}/10s`, inline: true },
            { name: "Channel Delete", value: `${cfg.channelDeleteThreshold}/10s`, inline: true },
            { name: "Role Delete", value: `${cfg.roleDeleteThreshold}/10s`, inline: true },
            { name: "Log Channel", value: cfg.logChannelId ? `<#${cfg.logChannelId}>` : "None", inline: true },
            { name: "\u200b", value: "\u200b", inline: true },
            { name: "Whitelist", value: cfg.whitelist.length > 0 ? cfg.whitelist.map(id => `<@${id}>`).join(", ") : "None", inline: false },
          ),
      ],
    });
    return;
  }

  if (sub === "action") {
    const action = args[1]?.toLowerCase() as Punishment | undefined;
    if (!action || !["ban", "kick", "derank"].includes(action)) {
      await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Usage: `!antinuke action <ban|kick|derank>`")] });
      return;
    }
    cfg.punishment = action;
    const label = action === "ban" ? "🔨 Ban" : action === "kick" ? "👢 Kick" : "🎭 Derank only";
    await message.reply({ embeds: [new EmbedBuilder().setColor(G).setDescription(`✅ Punishment set to **${label}**.`)] });
    return;
  }

  if (sub === "threshold") {
    const action = args[1]?.toLowerCase();
    const count = parseInt(args[2] ?? "");
    if (!action || isNaN(count) || count < 1 || count > 20) {
      await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Usage: `!antinuke threshold <ban|kick|channel|role> <count>`")] });
      return;
    }
    if (action === "ban") cfg.banThreshold = count;
    else if (action === "kick") cfg.kickThreshold = count;
    else if (action === "channel") cfg.channelDeleteThreshold = count;
    else if (action === "role") cfg.roleDeleteThreshold = count;
    else { await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Type: `ban`, `kick`, `channel`, or `role`")] }); return; }
    await message.reply({ embeds: [new EmbedBuilder().setColor(G).setDescription(`✅ **${action}** threshold → **${count}** per 10s.`)] });
    return;
  }

  if (sub === "whitelist") {
    const target = message.mentions.users.first();
    if (!target) { await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Usage: `!antinuke whitelist @user`")] }); return; }
    if (cfg.whitelist.includes(target.id)) {
      cfg.whitelist = cfg.whitelist.filter(id => id !== target.id);
      await message.reply({ embeds: [new EmbedBuilder().setColor(G).setDescription(`✅ **${target.username}** removed from whitelist.`)] });
    } else {
      cfg.whitelist.push(target.id);
      await message.reply({ embeds: [new EmbedBuilder().setColor(G).setDescription(`✅ **${target.username}** added to whitelist.`)] });
    }
    return;
  }

  if (sub === "logs" || sub === "logging") {
    const ch = message.mentions.channels.first();
    if (!ch) { await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Usage: `!antinuke logs #channel`")] }); return; }
    cfg.logChannelId = ch.id;
    await message.reply({ embeds: [new EmbedBuilder().setColor(G).setDescription(`✅ Anti-Nuke logs → <#${ch.id}>.`)] });
    return;
  }

  await message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(C)
        .setTitle("🛡️ Anti-Nuke Commands")
        .setDescription(
          "`!antinuke enable` — enable protection (with TOS confirmation)\n" +
          "`!antinuke disable` — disable protection\n" +
          "`!antinuke status` — show current config\n" +
          "`!antinuke action <ban|kick|derank>` — set punishment\n" +
          "`!antinuke threshold <ban|kick|channel|role> <n>` — trigger threshold\n" +
          "`!antinuke whitelist @user` — toggle whitelist\n" +
          "`!antinuke logs #channel` — set log channel",
        ),
    ],
  });
}

export function getAntiNukeConfig(guildId: string): AntiNukeConfig {
  return getConfig(guildId);
}
