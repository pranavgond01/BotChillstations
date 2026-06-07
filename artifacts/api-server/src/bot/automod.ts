import {
  type Message,
  PermissionFlagsBits,
  EmbedBuilder,
  type GuildMember,
  type TextChannel,
} from "discord.js";
import { logger } from "../lib/logger";

interface AutoModConfig {
  enabled: boolean;
  badWords: string[];
  spamEnabled: boolean;
  spamThreshold: number;
  spamWindowMs: number;
  capsEnabled: boolean;
  capsPercent: number;
  linksEnabled: boolean;
  invitesEnabled: boolean;
  logChannelId: string | null;
  exemptRoleIds: string[];
}

interface SpamBucket {
  count: number;
  timer: ReturnType<typeof setTimeout>;
}

const C = 0xff0000;
const configs = new Map<string, AutoModConfig>();
const spamBuckets = new Map<string, Map<string, SpamBucket>>();

function getConfig(guildId: string): AutoModConfig {
  if (!configs.has(guildId)) {
    configs.set(guildId, {
      enabled: false,
      badWords: [],
      spamEnabled: true,
      spamThreshold: 5,
      spamWindowMs: 5_000,
      capsEnabled: true,
      capsPercent: 70,
      linksEnabled: false,
      invitesEnabled: true,
      logChannelId: null,
      exemptRoleIds: [],
    });
  }
  return configs.get(guildId)!;
}

function isExempt(member: GuildMember, cfg: AutoModConfig): boolean {
  if (member.permissions.has(PermissionFlagsBits.ManageMessages)) return true;
  return cfg.exemptRoleIds.some(id => member.roles.cache.has(id));
}

async function sendLog(guild: NonNullable<Message["guild"]>, logChannelId: string | null, action: string, msg: Message): Promise<void> {
  if (!logChannelId) return;
  const ch = guild.channels.cache.get(logChannelId) as TextChannel | undefined;
  if (!ch) return;
  await ch.send({
    embeds: [
      new EmbedBuilder()
        .setColor(C)
        .setTitle("🤖 AutoMod Action")
        .setDescription(`**Trigger:** ${action}\n**User:** ${msg.author.tag} (<@${msg.author.id}>)\n**Channel:** <#${msg.channelId}>\n**Content:** ${msg.content.slice(0, 300)}`)
        .setTimestamp(),
    ],
  }).catch(() => {});
}

export async function processAutoMod(message: Message): Promise<boolean> {
  if (!message.guild || message.author.bot) return false;
  const cfg = getConfig(message.guild.id);
  if (!cfg.enabled) return false;
  const member = message.member;
  if (!member || isExempt(member, cfg)) return false;

  const content = message.content;
  const lower = content.toLowerCase();

  // ── Bad words ─────────────────────────────────────────────────────────────
  if (cfg.badWords.length > 0) {
    const found = cfg.badWords.find(w => lower.includes(w.toLowerCase()));
    if (found) {
      await message.delete().catch(() => {});
      const w = await (message.channel as TextChannel).send({ embeds: [new EmbedBuilder().setColor(C).setDescription(`🚫 <@${message.author.id}> Your message was removed (blocked word).`)] });
      setTimeout(() => w.delete().catch(() => {}), 5_000);
      await sendLog(message.guild!, cfg.logChannelId, `Bad word: \`${found}\``, message);
      return true;
    }
  }

  // ── Discord invite filter ──────────────────────────────────────────────────
  if (cfg.invitesEnabled && /discord\.(gg|io|me|li|com\/invite)\//i.test(content)) {
    await message.delete().catch(() => {});
    const w = await (message.channel as TextChannel).send({ embeds: [new EmbedBuilder().setColor(C).setDescription(`🚫 <@${message.author.id}> Discord invites are not allowed here.`)] });
    setTimeout(() => w.delete().catch(() => {}), 5_000);
    await sendLog(message.guild!, cfg.logChannelId, "Discord invite link", message);
    return true;
  }

  // ── Link filter ───────────────────────────────────────────────────────────
  if (cfg.linksEnabled && /https?:\/\//i.test(content)) {
    await message.delete().catch(() => {});
    const w = await (message.channel as TextChannel).send({ embeds: [new EmbedBuilder().setColor(C).setDescription(`🚫 <@${message.author.id}> Links are not allowed in this channel.`)] });
    setTimeout(() => w.delete().catch(() => {}), 5_000);
    await sendLog(message.guild!, cfg.logChannelId, "External link", message);
    return true;
  }

  // ── Caps filter ───────────────────────────────────────────────────────────
  if (cfg.capsEnabled && content.length >= 8) {
    const letters = content.replace(/[^a-zA-Z]/g, "");
    if (letters.length >= 8) {
      const upperPct = (letters.replace(/[^A-Z]/g, "").length / letters.length) * 100;
      if (upperPct >= cfg.capsPercent) {
        await message.delete().catch(() => {});
        const w = await (message.channel as TextChannel).send({ embeds: [new EmbedBuilder().setColor(C).setDescription(`🚫 <@${message.author.id}> Please don't use excessive caps!`)] });
        setTimeout(() => w.delete().catch(() => {}), 5_000);
        await sendLog(message.guild!, cfg.logChannelId, `Excessive caps (${Math.round(upperPct)}%)`, message);
        return true;
      }
    }
  }

  // ── Spam filter ───────────────────────────────────────────────────────────
  if (cfg.spamEnabled) {
    const guildId = message.guild!.id;
    const userId = message.author.id;
    if (!spamBuckets.has(guildId)) spamBuckets.set(guildId, new Map());
    const gb = spamBuckets.get(guildId)!;
    const existing = gb.get(userId);
    if (existing) {
      existing.count++;
      if (existing.count >= cfg.spamThreshold) {
        clearTimeout(existing.timer);
        gb.delete(userId);
        await message.delete().catch(() => {});
        await member.timeout(60_000, "AutoMod: spam").catch(() => {});
        const w = await (message.channel as TextChannel).send({ embeds: [new EmbedBuilder().setColor(C).setDescription(`🚫 <@${message.author.id}> Stop spamming! You've been timed out for 1 minute.`)] });
        setTimeout(() => w.delete().catch(() => {}), 8_000);
        await sendLog(message.guild!, cfg.logChannelId, `Spam (${cfg.spamThreshold}+ msgs/${cfg.spamWindowMs / 1000}s)`, message);
        return true;
      }
    } else {
      const timer = setTimeout(() => gb.delete(userId), cfg.spamWindowMs);
      gb.set(userId, { count: 1, timer });
    }
  }

  return false;
}

export async function handleAutoMod(message: Message): Promise<void> {
  if (!message.guild) return;
  const member = message.member;
  if (!member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ You need **Manage Server** permission.")] });
    return;
  }

  const args = message.content.trim().split(/\s+/).slice(1);
  const sub = args[0]?.toLowerCase();
  const cfg = getConfig(message.guild.id);

  if (!sub || sub === "status") {
    await message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(cfg.enabled ? 0x00ff00 : C)
          .setTitle("🤖 AutoMod Status")
          .addFields(
            { name: "Status", value: cfg.enabled ? "✅ Enabled" : "❌ Disabled", inline: true },
            { name: "Spam", value: cfg.spamEnabled ? `✅ ${cfg.spamThreshold} msgs/${cfg.spamWindowMs / 1000}s` : "❌ Off", inline: true },
            { name: "Caps", value: cfg.capsEnabled ? `✅ ${cfg.capsPercent}%+` : "❌ Off", inline: true },
            { name: "Links", value: cfg.linksEnabled ? "✅ Blocked" : "❌ Allowed", inline: true },
            { name: "Invites", value: cfg.invitesEnabled ? "✅ Blocked" : "❌ Allowed", inline: true },
            { name: "Bad Words", value: `${cfg.badWords.length} word${cfg.badWords.length !== 1 ? "s" : ""}`, inline: true },
            { name: "Log Channel", value: cfg.logChannelId ? `<#${cfg.logChannelId}>` : "None", inline: true },
          ),
      ],
    });
    return;
  }

  if (sub === "enable") { cfg.enabled = true; await message.reply({ embeds: [new EmbedBuilder().setColor(0x00ff00).setDescription("✅ AutoMod **enabled**!")] }); return; }
  if (sub === "disable") { cfg.enabled = false; await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("✅ AutoMod **disabled**.")] }); return; }

  if (sub === "badwords") {
    const action = args[1]?.toLowerCase();
    if (action === "list") {
      const list = cfg.badWords.length > 0 ? cfg.badWords.map(w => `\`${w}\``).join(", ") : "None set.";
      await message.reply({ embeds: [new EmbedBuilder().setColor(C).setTitle("🚫 Bad Words List").setDescription(list)] });
      return;
    }
    if (action === "add") {
      const word = args[2]?.toLowerCase();
      if (!word) { await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Usage: `!automod badwords add <word>`")] }); return; }
      if (!cfg.badWords.includes(word)) cfg.badWords.push(word);
      await message.reply({ embeds: [new EmbedBuilder().setColor(0x00ff00).setDescription(`✅ Added \`${word}\` to bad words list.`)] });
      return;
    }
    if (action === "remove") {
      const word = args[2]?.toLowerCase();
      if (!word) { await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Usage: `!automod badwords remove <word>`")] }); return; }
      cfg.badWords = cfg.badWords.filter(w => w !== word);
      await message.reply({ embeds: [new EmbedBuilder().setColor(0x00ff00).setDescription(`✅ Removed \`${word}\` from bad words list.`)] });
      return;
    }
    if (action === "clear") {
      cfg.badWords = [];
      await message.reply({ embeds: [new EmbedBuilder().setColor(0x00ff00).setDescription("✅ Bad words list cleared.")] });
      return;
    }
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Usage: `!automod badwords <add|remove|list|clear> [word]`")] });
    return;
  }

  if (sub === "spam") {
    const count = parseInt(args[1] ?? "");
    if (isNaN(count) || count < 2 || count > 20) { await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Usage: `!automod spam <2-20>` (msgs per 5s before mute)")] }); return; }
    cfg.spamEnabled = true; cfg.spamThreshold = count;
    await message.reply({ embeds: [new EmbedBuilder().setColor(0x00ff00).setDescription(`✅ Spam filter: **${count}** messages in 5s → 1 min timeout.`)] });
    return;
  }

  if (sub === "caps") {
    if (args[1]?.toLowerCase() === "off") { cfg.capsEnabled = false; await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("✅ Caps filter disabled.")] }); return; }
    const pct = parseInt(args[1] ?? "");
    if (isNaN(pct) || pct < 10 || pct > 100) { await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Usage: `!automod caps <10-100|off>`")] }); return; }
    cfg.capsEnabled = true; cfg.capsPercent = pct;
    await message.reply({ embeds: [new EmbedBuilder().setColor(0x00ff00).setDescription(`✅ Caps filter: **${pct}%+** caps → deleted.`)] });
    return;
  }

  if (sub === "links") {
    const onOff = args[1]?.toLowerCase();
    if (onOff === "on") { cfg.linksEnabled = true; await message.reply({ embeds: [new EmbedBuilder().setColor(0x00ff00).setDescription("✅ Link filter **enabled** — all http(s) links deleted.")] }); }
    else if (onOff === "off") { cfg.linksEnabled = false; await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("✅ Link filter **disabled**.")] }); }
    else await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Usage: `!automod links <on|off>`")] });
    return;
  }

  if (sub === "invites") {
    const onOff = args[1]?.toLowerCase();
    if (onOff === "on") { cfg.invitesEnabled = true; await message.reply({ embeds: [new EmbedBuilder().setColor(0x00ff00).setDescription("✅ Invite filter **enabled**.")] }); }
    else if (onOff === "off") { cfg.invitesEnabled = false; await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("✅ Invite filter **disabled**.")] }); }
    else await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Usage: `!automod invites <on|off>`")] });
    return;
  }

  if (sub === "logs") {
    const ch = message.mentions.channels.first();
    if (!ch) { await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Usage: `!automod logs #channel`")] }); return; }
    cfg.logChannelId = ch.id;
    await message.reply({ embeds: [new EmbedBuilder().setColor(0x00ff00).setDescription(`✅ AutoMod logs → <#${ch.id}>.`)] });
    return;
  }

  if (sub === "exempt") {
    const role = message.mentions.roles.first();
    if (!role) { await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Usage: `!automod exempt @role`")] }); return; }
    if (cfg.exemptRoleIds.includes(role.id)) {
      cfg.exemptRoleIds = cfg.exemptRoleIds.filter(id => id !== role.id);
      await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(`✅ **${role.name}** removed from exempt list.`)] });
    } else {
      cfg.exemptRoleIds.push(role.id);
      await message.reply({ embeds: [new EmbedBuilder().setColor(0x00ff00).setDescription(`✅ **${role.name}** is now exempt from AutoMod.`)] });
    }
    return;
  }

  await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Subcommands: `enable`, `disable`, `status`, `badwords`, `spam <n>`, `caps <n|off>`, `links <on|off>`, `invites <on|off>`, `logs #ch`, `exempt @role`")] });
}

export function getAutoModConfig(guildId: string): AutoModConfig {
  return getConfig(guildId);
}
