import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  PermissionFlagsBits,
  type Message,
  type Client,
  type ButtonInteraction,
  type VoiceState,
  type Guild,
  type TextChannel,
} from "discord.js";
import { db } from "@workspace/db";
import { lbStatsTable, lbResetsTable, liveLbConfigsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

type Period = "daily" | "weekly" | "monthly" | "lifetime";
type Stat = "chat" | "vc";

interface UserStats {
  messages: Record<Period, number>;
  voiceMs: Record<Period, number>;
}

interface GuildStats {
  users: Map<string, UserStats>;
  lastReset: { daily: number; weekly: number; monthly: number; };
}

export const stats = new Map<string, GuildStats>();
export { type GuildStats, type UserStats, type Period };
const vcJoinTimes = new Map<string, number>();

interface LiveLbConfig { channelId: string; stat: Stat; period: Period; messageId?: string; }
const liveLbConfigs = new Map<string, LiveLbConfig>();
const liveLbTimers = new Map<string, ReturnType<typeof setInterval>>();
const dirtyUsers = new Set<string>();
let _liveClient: Client | null = null;

function makeEmpty(): UserStats {
  return { messages: { daily: 0, weekly: 0, monthly: 0, lifetime: 0 }, voiceMs: { daily: 0, weekly: 0, monthly: 0, lifetime: 0 } };
}

function getGuildStats(guildId: string): GuildStats {
  if (!stats.has(guildId)) stats.set(guildId, { users: new Map(), lastReset: { daily: Date.now(), weekly: Date.now(), monthly: Date.now() } });
  return stats.get(guildId)!;
}

function getUserStats(guildId: string, userId: string): UserStats {
  const g = getGuildStats(guildId);
  if (!g.users.has(userId)) g.users.set(userId, makeEmpty());
  return g.users.get(userId)!;
}

function checkResets(guildId: string): void {
  const g = getGuildStats(guildId);
  const now = Date.now();
  const d = new Date(now);
  const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  if (g.lastReset.daily < dayStart) { for (const u of g.users.values()) { u.messages.daily = 0; u.voiceMs.daily = 0; } g.lastReset.daily = dayStart; }
  const weekDay = d.getDay();
  const weekStart = new Date(d.getFullYear(), d.getMonth(), d.getDate() - weekDay).getTime();
  if (g.lastReset.weekly < weekStart) { for (const u of g.users.values()) { u.messages.weekly = 0; u.voiceMs.weekly = 0; } g.lastReset.weekly = weekStart; }
  const monthStart = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  if (g.lastReset.monthly < monthStart) { for (const u of g.users.values()) { u.messages.monthly = 0; u.voiceMs.monthly = 0; } g.lastReset.monthly = monthStart; }
}

export function trackMessage(guildId: string, userId: string): void {
  checkResets(guildId);
  const u = getUserStats(guildId, userId);
  u.messages.daily++; u.messages.weekly++; u.messages.monthly++; u.messages.lifetime++;
  dirtyUsers.add(`${guildId}:${userId}`);
}

export function trackVcJoin(guildId: string, userId: string): void {
  vcJoinTimes.set(`${guildId}:${userId}`, Date.now());
}

export function trackVcLeave(guildId: string, userId: string): void {
  const key = `${guildId}:${userId}`;
  const joinTime = vcJoinTimes.get(key);
  if (!joinTime) return;
  vcJoinTimes.delete(key);
  const elapsed = Date.now() - joinTime;
  checkResets(guildId);
  const u = getUserStats(guildId, userId);
  u.voiceMs.daily += elapsed; u.voiceMs.weekly += elapsed; u.voiceMs.monthly += elapsed; u.voiceMs.lifetime += elapsed;
  dirtyUsers.add(`${guildId}:${userId}`);
}

export function handleVoiceStateUpdate(oldState: VoiceState, newState: VoiceState): void {
  const guildId = newState.guild.id;
  const userId = newState.id;
  if (newState.member?.user.bot) return;
  const wasInVc = !!oldState.channel;
  const isInVc = !!newState.channel;
  if (!wasInVc && isInVc) trackVcJoin(guildId, userId);
  else if (wasInVc && !isInVc) trackVcLeave(guildId, userId);
}

export async function loadLbFromDb(): Promise<void> {
  const statRows = await db.select().from(lbStatsTable);
  for (const row of statRows) {
    const u = getUserStats(row.guildId, row.userId);
    u.messages.daily = row.messagesDaily; u.messages.weekly = row.messagesWeekly;
    u.messages.monthly = row.messagesMonthly; u.messages.lifetime = row.messagesLifetime;
    u.voiceMs.daily = row.voiceMsDaily; u.voiceMs.weekly = row.voiceMsWeekly;
    u.voiceMs.monthly = row.voiceMsMonthly; u.voiceMs.lifetime = row.voiceMsLifetime;
  }
  const resetRows = await db.select().from(lbResetsTable);
  for (const row of resetRows) {
    const g = getGuildStats(row.guildId);
    g.lastReset.daily = row.lastDaily; g.lastReset.weekly = row.lastWeekly; g.lastReset.monthly = row.lastMonthly;
  }
}

export async function flushLbToDb(): Promise<void> {
  if (dirtyUsers.size === 0) return;
  const toFlush = [...dirtyUsers];
  dirtyUsers.clear();
  const values: (typeof lbStatsTable.$inferInsert)[] = [];
  const dirtyGuilds = new Set<string>();
  for (const key of toFlush) {
    const colonIdx = key.indexOf(":");
    const guildId = key.slice(0, colonIdx);
    const userId = key.slice(colonIdx + 1);
    dirtyGuilds.add(guildId);
    const g = stats.get(guildId);
    if (!g) continue;
    const u = g.users.get(userId);
    if (!u) continue;
    values.push({ guildId, userId, messagesDaily: u.messages.daily, messagesWeekly: u.messages.weekly, messagesMonthly: u.messages.monthly, messagesLifetime: u.messages.lifetime, voiceMsDaily: u.voiceMs.daily, voiceMsWeekly: u.voiceMs.weekly, voiceMsMonthly: u.voiceMs.monthly, voiceMsLifetime: u.voiceMs.lifetime });
  }
  if (values.length > 0) {
    await db.insert(lbStatsTable).values(values).onConflictDoUpdate({
      target: [lbStatsTable.guildId, lbStatsTable.userId],
      set: {
        messagesDaily: sql`excluded.messages_daily`, messagesWeekly: sql`excluded.messages_weekly`,
        messagesMonthly: sql`excluded.messages_monthly`, messagesLifetime: sql`excluded.messages_lifetime`,
        voiceMsDaily: sql`excluded.voice_ms_daily`, voiceMsWeekly: sql`excluded.voice_ms_weekly`,
        voiceMsMonthly: sql`excluded.voice_ms_monthly`, voiceMsLifetime: sql`excluded.voice_ms_lifetime`,
      },
    });
  }
  const resetValues: (typeof lbResetsTable.$inferInsert)[] = [];
  for (const guildId of dirtyGuilds) {
    const g = stats.get(guildId);
    if (!g) continue;
    resetValues.push({ guildId, lastDaily: g.lastReset.daily, lastWeekly: g.lastReset.weekly, lastMonthly: g.lastReset.monthly });
  }
  if (resetValues.length > 0) {
    await db.insert(lbResetsTable).values(resetValues).onConflictDoUpdate({
      target: lbResetsTable.guildId,
      set: { lastDaily: sql`excluded.last_daily`, lastWeekly: sql`excluded.last_weekly`, lastMonthly: sql`excluded.last_monthly` },
    });
  }
}

export async function resetLbStatsForPeriod(guildId: string, period: string): Promise<boolean> {
  const g = getGuildStats(guildId);
  if (period === "daily") {
    for (const u of g.users.values()) { u.messages.daily = 0; u.voiceMs.daily = 0; }
    await db.update(lbStatsTable).set({ messagesDaily: 0, voiceMsDaily: 0 }).where(eq(lbStatsTable.guildId, guildId));
    return true;
  }
  if (period === "weekly") {
    for (const u of g.users.values()) { u.messages.weekly = 0; u.voiceMs.weekly = 0; }
    await db.update(lbStatsTable).set({ messagesWeekly: 0, voiceMsWeekly: 0 }).where(eq(lbStatsTable.guildId, guildId));
    return true;
  }
  if (period === "monthly") {
    for (const u of g.users.values()) { u.messages.monthly = 0; u.voiceMs.monthly = 0; }
    await db.update(lbStatsTable).set({ messagesMonthly: 0, voiceMsMonthly: 0 }).where(eq(lbStatsTable.guildId, guildId));
    return true;
  }
  if (period === "all" || period === "lifetime") {
    g.users.clear();
    await db.delete(lbStatsTable).where(eq(lbStatsTable.guildId, guildId));
    return true;
  }
  return false;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const m = Math.floor(totalSeconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem > 0 ? `${h}h ${rem}m` : `${h}h`;
}

const MEDALS = ["🥇", "🥈", "🥉"];
const PERIOD_LABELS: Record<Period, string> = { daily: "Today", weekly: "This Week", monthly: "This Month", lifetime: "All Time" };
const PERIOD_SHORT: Record<Period, string> = { daily: "Daily", weekly: "Weekly", monthly: "Monthly", lifetime: "All Time" };

function buildLeaderboardEmbed(guild: Guild, stat: Stat, period: Period): EmbedBuilder {
  checkResets(guild.id);
  const g = getGuildStats(guild.id);
  const entries = [...g.users.entries()].map(([userId, u]) => ({ userId, value: stat === "chat" ? u.messages[period] : u.voiceMs[period] })).filter((e) => e.value > 0).sort((a, b) => b.value - a.value).slice(0, 10);
  const icon = stat === "chat" ? "💬" : "🎙️";
  const label = stat === "chat" ? "Chat Leaderboard" : "VC Leaderboard";
  if (entries.length === 0) return new EmbedBuilder().setColor(0xff0000).setTitle(`${icon} ${label} — ${PERIOD_LABELS[period]}`).setDescription("No data yet.").setFooter({ text: `${guild.name} • Updates live` }).setTimestamp();
  const top = entries[0].value;
  const lines = entries.map((e, i) => {
    const medal = MEDALS[i] ?? `**${i + 1}.**`;
    const val = stat === "chat" ? `**${e.value.toLocaleString()}** msg${e.value !== 1 ? "s" : ""}` : `**${formatDuration(e.value)}**`;
    const pct = top > 0 ? Math.round((e.value / top) * 10) : 0;
    const bar = "█".repeat(pct) + "░".repeat(10 - pct);
    return `${medal} <@${e.userId}>\n\`${bar}\` ${val}`;
  });
  return new EmbedBuilder().setColor(0xff0000).setTitle(`${icon} ${label} — ${PERIOD_LABELS[period]}`).setDescription(lines.join("\n\n")).setFooter({ text: `${guild.name} • Top ${entries.length} • Updates live` }).setTimestamp();
}

function buildStatRow(stat: Stat): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("lb_chat").setLabel("💬 Chat").setStyle(stat === "chat" ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("lb_vc").setLabel("🎙️ Voice").setStyle(stat === "vc" ? ButtonStyle.Primary : ButtonStyle.Secondary),
  );
}

function buildPeriodRow(period: Period): ActionRowBuilder<ButtonBuilder> {
  const periods: Period[] = ["daily", "weekly", "monthly", "lifetime"];
  const labels: Record<Period, string> = { daily: "📅 Today", weekly: "📆 Weekly", monthly: "🗓️ Monthly", lifetime: "🏆 All Time" };
  return new ActionRowBuilder<ButtonBuilder>().addComponents(periods.map((p) => new ButtonBuilder().setCustomId(`lb_${p}`).setLabel(labels[p]).setStyle(period === p ? ButtonStyle.Primary : ButtonStyle.Secondary)));
}

export async function handleLeaderboard(message: Message): Promise<void> {
  if (!message.guild) return;
  let stat: Stat = "chat";
  let period: Period = "lifetime";
  const args = message.content.trim().split(/\s+/).slice(1);
  for (const arg of args) {
    if (["chat", "messages", "msg"].includes(arg.toLowerCase())) stat = "chat";
    if (["vc", "voice"].includes(arg.toLowerCase())) stat = "vc";
    if (["daily", "today"].includes(arg.toLowerCase())) period = "daily";
    if (["weekly", "week"].includes(arg.toLowerCase())) period = "weekly";
    if (["monthly", "month"].includes(arg.toLowerCase())) period = "monthly";
    if (["lifetime", "alltime", "all"].includes(arg.toLowerCase())) period = "lifetime";
  }
  const lbMsg = await message.reply({ embeds: [buildLeaderboardEmbed(message.guild, stat, period)], components: [buildStatRow(stat), buildPeriodRow(period)] });
  const collector = lbMsg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 120_000 });
  collector.on("collect", async (interaction: ButtonInteraction) => {
    if (interaction.customId.startsWith("lb_")) {
      const key = interaction.customId.replace("lb_", "");
      if (key === "chat" || key === "vc") stat = key as Stat;
      else if (["daily", "weekly", "monthly", "lifetime"].includes(key)) period = key as Period;
    }
    await interaction.update({ embeds: [buildLeaderboardEmbed(interaction.guild!, stat, period)], components: [buildStatRow(stat), buildPeriodRow(period)] });
  });
  collector.on("end", async () => {
    const dis = (s: ButtonStyle) => new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId("lb_chat").setLabel("💬 Chat").setStyle(s).setDisabled(true),
      new ButtonBuilder().setCustomId("lb_vc").setLabel("🎙️ Voice").setStyle(s).setDisabled(true),
    );
    await lbMsg.edit({ components: [dis(ButtonStyle.Secondary), dis(ButtonStyle.Secondary)] }).catch(() => {});
  });
}

const INTERVAL_MS = 30_000;

function buildLiveLbEmbed(guild: Guild, stat: Stat, period: Period, nextUpdateSec: number): EmbedBuilder {
  checkResets(guild.id);
  const g = getGuildStats(guild.id);
  const entries = [...g.users.entries()].map(([userId, u]) => ({ userId, value: stat === "chat" ? u.messages[period] : u.voiceMs[period] })).filter((e) => e.value > 0).sort((a, b) => b.value - a.value).slice(0, 10);
  const icon = stat === "chat" ? "💬" : "🎙️";
  const label = stat === "chat" ? "Chat" : "Voice";
  const color = stat === "chat" ? 0xff0000 : 0x57f287;
  const tipLine = stat === "chat" ? "**Chat more to climb the ranks!**" : "**Spend More Time In Voice Channels To Climb The Ranks!**";
  const lines = entries.map((e, i) => { const num = i < 3 ? ["1.", "2.", "3."][i] : `${i + 1}.`; const val = stat === "chat" ? `${e.value.toLocaleString()} msg${e.value !== 1 ? "s" : ""}` : formatDuration(e.value); return `${num} <@${e.userId}> — **${val}**`; });
  return new EmbedBuilder().setColor(color).setTitle(`${icon} ${PERIOD_SHORT[period]} ${label} Leaderboard`)
    .setDescription((lines.length > 0 ? lines.join("\n") : "*No data yet.*") + `\n\n${tipLine}`)
    .setThumbnail(guild.iconURL({ size: 128 }) ?? null)
    .setFooter({ text: `${entries.length} member${entries.length !== 1 ? "s" : ""} ranked · Next update in ${nextUpdateSec}s` }).setTimestamp();
}

async function runLiveUpdate(client: Client, guildId: string): Promise<void> {
  const config = liveLbConfigs.get(guildId);
  if (!config) return;
  try {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;
    const channel = guild.channels.cache.get(config.channelId) as TextChannel | undefined;
    if (!channel?.isTextBased()) return;
    const embed = buildLiveLbEmbed(guild, config.stat, config.period, Math.round(INTERVAL_MS / 1000));
    if (config.messageId) {
      try {
        const msg = await channel.messages.fetch(config.messageId);
        await msg.edit({ embeds: [embed] });
        return;
      } catch { config.messageId = undefined; }
    }
    const msg = await channel.send({ embeds: [embed] });
    config.messageId = msg.id;
    liveLbConfigs.set(guildId, config);
    await db.insert(liveLbConfigsTable).values({ guildId, channelId: config.channelId, stat: config.stat, period: config.period, messageId: msg.id })
      .onConflictDoUpdate({ target: liveLbConfigsTable.guildId, set: { messageId: msg.id } });
  } catch { /* guild or channel unavailable */ }
}

function startLiveLb(client: Client, guildId: string): void {
  const existing = liveLbTimers.get(guildId);
  if (existing) clearInterval(existing);
  void runLiveUpdate(client, guildId);
  const timer = setInterval(() => void runLiveUpdate(client, guildId), INTERVAL_MS);
  liveLbTimers.set(guildId, timer);
}

export function setLiveLbConfig(client: Client, guildId: string, channelId: string, stat: Stat, period: Period): void {
  liveLbConfigs.set(guildId, { channelId, stat, period });
  db.insert(liveLbConfigsTable).values({ guildId, channelId, stat, period })
    .onConflictDoUpdate({ target: liveLbConfigsTable.guildId, set: { channelId, stat, period, messageId: null } })
    .then(() => {}).catch(() => {});
  startLiveLb(client, guildId);
}

export function disableLiveLbConfig(guildId: string): void {
  const timer = liveLbTimers.get(guildId);
  if (timer) clearInterval(timer);
  liveLbTimers.delete(guildId);
  liveLbConfigs.delete(guildId);
  db.delete(liveLbConfigsTable).where(eq(liveLbConfigsTable.guildId, guildId)).then(() => {}).catch(() => {});
}

export async function loadLiveLbConfigsFromDb(client: Client): Promise<void> {
  const rows = await db.select().from(liveLbConfigsTable);
  for (const row of rows) {
    liveLbConfigs.set(row.guildId, { channelId: row.channelId, stat: row.stat as Stat, period: row.period as Period, messageId: row.messageId ?? undefined });
    startLiveLb(client, row.guildId);
  }
}

export function initLiveLb(client: Client): void {
  _liveClient = client;
  setInterval(() => { void flushLbToDb(); }, 60_000);
}

export async function handleSetLb(client: Client, message: Message): Promise<void> {
  if (!message.guild) return;
  const mod = message.guild.members.cache.get(message.author.id);
  if (!mod?.permissions.has(PermissionFlagsBits.ManageGuild)) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription("❌ You need **Manage Server** permission.")] });
    return;
  }
  const args = message.content.trim().split(/\s+/).slice(1);
  if (args[0]?.toLowerCase() === "disable") {
    disableLiveLbConfig(message.guild.id);
    await message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription("✅ Live leaderboard **disabled**.")] });
    return;
  }
  const channel = message.mentions.channels.first() as TextChannel | undefined;
  if (!channel) {
    const cur = liveLbConfigs.get(message.guild.id);
    await message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setTitle("📊 Live Leaderboard Setup").setDescription(cur ? `**Channel:** <#${cur.channelId}>\n**Type:** ${cur.stat === "chat" ? "💬 Chat" : "🎙️ Voice"}\n**Period:** ${PERIOD_SHORT[cur.period]}` : "Not configured.").addFields({ name: "Usage", value: "`!setlb #channel [chat|vc] [daily|weekly|monthly|all]`\n`!setlb disable` — stop\n\n**Example:** `!setlb #voice-lb vc daily`\nUpdates every **30 seconds**." })] });
    return;
  }
  let stat: Stat = "vc";
  let period: Period = "daily";
  for (const arg of args) {
    const a = arg.toLowerCase();
    if (["chat", "messages"].includes(a)) stat = "chat";
    if (["vc", "voice"].includes(a)) stat = "vc";
    if (["daily", "today"].includes(a)) period = "daily";
    if (["weekly", "week"].includes(a)) period = "weekly";
    if (["monthly", "month"].includes(a)) period = "monthly";
    if (["lifetime", "all", "alltime"].includes(a)) period = "lifetime";
  }
  setLiveLbConfig(client, message.guild.id, channel.id, stat, period);
  await message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription(`✅ Live leaderboard set!\n**Channel:** ${channel}\n**Type:** ${stat === "chat" ? "💬 Chat" : "🎙️ Voice"}\n**Period:** ${PERIOD_SHORT[period]}\n\nUpdates every **30 seconds** automatically.`)] });
}

export async function handleLbReset(message: Message): Promise<void> {
  if (!message.guild) return;
  const mod = message.guild.members.cache.get(message.author.id);
  if (!mod?.permissions.has(PermissionFlagsBits.ManageGuild)) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription("❌ You need **Manage Server** permission.")] });
    return;
  }
  const period = message.content.trim().split(/\s+/)[1]?.toLowerCase();
  if (!period) { await message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription("❌ Usage: `!lbreset daily|weekly|monthly|all`")] }); return; }
  const ok = await resetLbStatsForPeriod(message.guild.id, period);
  if (!ok) { await message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription("❌ Usage: `!lbreset daily|weekly|monthly|all`")] }); return; }
  await message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription(`✅ Reset **${period === "all" ? "all" : period}** leaderboard stats.`)] });
}
