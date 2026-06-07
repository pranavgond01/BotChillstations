import {
  SlashCommandBuilder,
  REST,
  Routes,
  EmbedBuilder,
  PermissionFlagsBits,
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  OverwriteType,
  type Client,
  type ChatInputCommandInteraction,
  type TextChannel,
  type GuildMember,
  type CategoryChannel,
} from "discord.js";
import { sniped } from "./snipe";
import { logger } from "../lib/logger";
import { handleHelpInteraction } from "./help";
import { handleAntiNuke } from "./antinuke";
import { handleAutoMod } from "./automod";
import { handleSetup } from "./setup";
import { addWarningToDb, getWarningsFromDb, clearWarningsFromDb } from "./warn";
import { logCase, getCase, getRecentCases, setModlogChannel, getModlogChannel, CASE_COLORS, CASE_EMOJIS } from "./cases";
import { getWelcomeConfig, upsertWelcomeConfig, deleteWelcomeConfig, handleWelcomeMember } from "./welcome";
import { getLeaveConfig, upsertLeaveConfig, deleteLeaveConfig, handleLeaveMember } from "./leave";
import { setNoPrefixRoleDb, deleteNoPrefixRoleDb, getNoPrefixRole } from "./noprefix";
import { getPrefix, setPrefix } from "./prefix";
import { getVanityConfigFromCache, setVanityRoleDb, deleteVanityRoleDb, statusHasVanity } from "./vanityrole";
import { getGuildTriggersFromCache, addTriggerEntry, removeTriggerEntry, clearTriggerEntries } from "./autotrigger";
import { getAllRR, addRREntry, removeRREntry, clearRREntries, normalizeEmoji } from "./reactionroles";
import { getTicketConfig, saveTicketConfigToDb, isOpenTicket, getTicketOpener, removeOpenTicket } from "./ticket";
import { setLiveLbConfig, disableLiveLbConfig, resetLbStatsForPeriod } from "./leaderboard";
import { startGiveaway, endGiveaway, rerollGiveaway, parseDuration } from "./giveaway";
import { stopWordbombGame, startWordbombInChannel, getWbWinsFromDb } from "./wordbomb";
import { safeCalc } from "./calc";
import { afkUsers } from "./afk";
import { handleAutoRole } from "./autorole";
import { handleSticky } from "./sticky";
import { handleAutoReact } from "./autoreact";

const C = 0xff0000;
const NO_PING = { parse: [] as never[] };
const LETTER_EMOJIS = ["🇦", "🇧", "🇨", "🇩", "🇪", "🇫", "🇬", "🇭", "🇮", "🇯"];

function sanitize(text: string): string {
  return text.replace(/@everyone/gi, "@\u200beveryone").replace(/@here/gi, "@\u200bhere");
}

function parseDur(input: string): number | null {
  const m = input.match(/^(\d+)(s|m|h|d)$/i);
  if (!m) return null;
  const v = parseInt(m[1]);
  const u = m[2].toLowerCase();
  return v * ({ s: 1000, m: 60000, h: 3600000, d: 86400000 } as Record<string, number>)[u];
}

export const commandDefs = [
  // ── Existing commands ──────────────────────────────────────────────────────
  new SlashCommandBuilder().setName("send").setDescription("Send a message as the bot").setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption((o) => o.setName("content").setDescription("Message to send").setRequired(true))
    .addChannelOption((o) => o.setName("channel").setDescription("Channel (default: current)").setRequired(false)),

  new SlashCommandBuilder().setName("say").setDescription("Bot says something in this channel")
    .addStringOption((o) => o.setName("message").setDescription("What to say").setRequired(true)),

  new SlashCommandBuilder().setName("embed").setDescription("Send a custom embed").setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption((o) => o.setName("description").setDescription("Embed body text").setRequired(true))
    .addStringOption((o) => o.setName("title").setDescription("Embed title").setRequired(false))
    .addStringOption((o) => o.setName("footer").setDescription("Footer text").setRequired(false))
    .addChannelOption((o) => o.setName("channel").setDescription("Channel (default: current)").setRequired(false)),

  new SlashCommandBuilder().setName("dm").setDescription("DM a user as the bot").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption((o) => o.setName("user").setDescription("User to DM").setRequired(true))
    .addStringOption((o) => o.setName("message").setDescription("Message to send").setRequired(true)),

  new SlashCommandBuilder().setName("repeat").setDescription("Send a message N times").setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption((o) => o.setName("times").setDescription("Number of times (1–10)").setMinValue(1).setMaxValue(10).setRequired(true))
    .addStringOption((o) => o.setName("message").setDescription("Message to repeat").setRequired(true)),

  new SlashCommandBuilder().setName("announce").setDescription("Send an embed announcement").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption((o) => o.setName("channel").setDescription("Channel to announce in").setRequired(true))
    .addStringOption((o) => o.setName("message").setDescription("Announcement text").setRequired(true)),

  new SlashCommandBuilder().setName("snipe").setDescription("Show the last deleted message in this channel"),

  new SlashCommandBuilder().setName("info").setDescription("Bot and server info")
    .addSubcommand((s) => s.setName("ping").setDescription("Show bot and API latency"))
    .addSubcommand((s) => s.setName("bot").setDescription("Show bot statistics and uptime"))
    .addSubcommand((s) => s.setName("members").setDescription("Show server member counts")),

  new SlashCommandBuilder().setName("help").setDescription("Browse all bot commands by category")
    .addStringOption((o) => o.setName("category").setDescription("Jump to a specific category").setRequired(false)
      .addChoices(
        { name: "🎉 Giveaway", value: "giveaway" },
        { name: "🛡️ Moderation", value: "moderation" },
        { name: "🔐 Security", value: "security" },
        { name: "📋 Cases & Mod Log", value: "cases" },
        { name: "⚙️ Config", value: "config" },
        { name: "📨 Messaging", value: "messaging" },
        { name: "📊 Polls, Reactions & Triggers", value: "engagement" },
        { name: "🎫 Tickets", value: "tickets" },
        { name: "📈 Leaderboard", value: "leaderboard" },
        { name: "🔍 Utility", value: "utility" },
        { name: "🎮 Fun & Games", value: "fun" },
        { name: "✍️ Text Tools", value: "texttools" },
        { name: "💞 Social & Reactions", value: "social" },
        { name: "🐾 Animals", value: "animals" },
      )),

  new SlashCommandBuilder().setName("link").setDescription("Get the bot's invite link to add it to your server"),

  new SlashCommandBuilder().setName("coinflip").setDescription("Flip a coin"),

  new SlashCommandBuilder().setName("dice").setDescription("Roll a dice")
    .addIntegerOption((o) => o.setName("sides").setDescription("Number of sides (2–1000, default 6)").setMinValue(2).setMaxValue(1000).setRequired(false)),

  new SlashCommandBuilder().setName("8ball").setDescription("Ask the magic 8-ball a question")
    .addStringOption((o) => o.setName("question").setDescription("Your question").setRequired(true)),

  new SlashCommandBuilder().setName("choose").setDescription("Pick a random option from a list")
    .addStringOption((o) => o.setName("options").setDescription("Options separated by commas: red, blue, green").setRequired(true)),

  new SlashCommandBuilder().setName("remind").setDescription("Set a reminder")
    .addStringOption((o) => o.setName("duration").setDescription("When to remind you: 30s, 5m, 2h, 1d").setRequired(true))
    .addStringOption((o) => o.setName("message").setDescription("What to remind you about").setRequired(true)),

  new SlashCommandBuilder().setName("servericon").setDescription("Show the server icon"),

  new SlashCommandBuilder().setName("userinfo").setDescription("View info about a user")
    .addUserOption((o) => o.setName("user").setDescription("User to look up (default: yourself)").setRequired(false)),

  new SlashCommandBuilder().setName("serverinfo").setDescription("View info about this server"),

  new SlashCommandBuilder().setName("avatar").setDescription("Get a user's avatar")
    .addUserOption((o) => o.setName("user").setDescription("User (default: yourself)").setRequired(false)),

  new SlashCommandBuilder().setName("leaderboard").setDescription("View the activity leaderboard (use !lb for full interactive version)"),

  new SlashCommandBuilder().setName("rank").setDescription("View your rank (use !rank for full stats)")
    .addUserOption((o) => o.setName("user").setDescription("User to check").setRequired(false)),

  // ── Moderation ─────────────────────────────────────────────────────────────
  new SlashCommandBuilder().setName("warn").setDescription("Warn a user").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption((o) => o.setName("user").setDescription("User to warn").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("Reason for warning").setRequired(false)),

  new SlashCommandBuilder().setName("warnings").setDescription("View warnings for a user").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption((o) => o.setName("user").setDescription("User to check").setRequired(true)),

  new SlashCommandBuilder().setName("clearwarnings").setDescription("Clear all warnings for a user").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption((o) => o.setName("user").setDescription("User to clear warnings for").setRequired(true)),

  new SlashCommandBuilder().setName("mute").setDescription("Timeout (mute) a user").setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) => o.setName("user").setDescription("User to mute").setRequired(true))
    .addStringOption((o) => o.setName("duration").setDescription("Duration: 30s, 5m, 2h, 28d").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("Reason").setRequired(false)),

  new SlashCommandBuilder().setName("unmute").setDescription("Remove timeout from a user").setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) => o.setName("user").setDescription("User to unmute").setRequired(true)),

  new SlashCommandBuilder().setName("kick").setDescription("Kick a user").setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption((o) => o.setName("user").setDescription("User to kick").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("Reason").setRequired(false)),

  new SlashCommandBuilder().setName("ban").setDescription("Ban a user").setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption((o) => o.setName("user").setDescription("User to ban").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("Reason").setRequired(false)),

  new SlashCommandBuilder().setName("unban").setDescription("Unban a user by ID").setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addStringOption((o) => o.setName("userid").setDescription("User ID to unban").setRequired(true)),

  new SlashCommandBuilder().setName("purge").setDescription("Delete messages in bulk").setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption((o) => o.setName("amount").setDescription("Number of messages (1–100)").setMinValue(1).setMaxValue(100).setRequired(true)),

  new SlashCommandBuilder().setName("purgebot").setDescription("Delete recent bot messages").setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption((o) => o.setName("amount").setDescription("Messages to scan (1–100, default 50)").setMinValue(1).setMaxValue(100).setRequired(false)),

  new SlashCommandBuilder().setName("nuke").setDescription("Delete all messages in this channel (irreversible)").setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  new SlashCommandBuilder().setName("slowmode").setDescription("Set channel slow mode").setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addIntegerOption((o) => o.setName("seconds").setDescription("Delay in seconds (0 to disable, max 21600)").setMinValue(0).setMaxValue(21600).setRequired(true)),

  new SlashCommandBuilder().setName("lock").setDescription("Lock this channel from @everyone").setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  new SlashCommandBuilder().setName("unlock").setDescription("Unlock this channel for @everyone").setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  // ── Cases ──────────────────────────────────────────────────────────────────
  new SlashCommandBuilder().setName("setmodlog").setDescription("Set the mod-log channel").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption((o) => o.setName("channel").setDescription("Channel (omit to view current)").setRequired(false)),

  new SlashCommandBuilder().setName("case").setDescription("Look up a moderation case").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addIntegerOption((o) => o.setName("id").setDescription("Case ID").setRequired(true)),

  new SlashCommandBuilder().setName("cases").setDescription("List recent moderation cases").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption((o) => o.setName("user").setDescription("Filter by user (optional)").setRequired(false)),

  // ── Poll ───────────────────────────────────────────────────────────────────
  new SlashCommandBuilder().setName("poll").setDescription("Create a poll").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((o) => o.setName("duration").setDescription("Poll duration: 30s, 5m, 1h, 7d").setRequired(true))
    .addStringOption((o) => o.setName("question").setDescription("Poll question").setRequired(true))
    .addStringOption((o) => o.setName("options").setDescription("Options separated by | (blank = Yes/No)").setRequired(false)),

  // ── Giveaway ───────────────────────────────────────────────────────────────
  new SlashCommandBuilder().setName("gstart").setDescription("Start a giveaway").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((o) => o.setName("duration").setDescription("Duration: 30s, 5m, 1h, 1d").setRequired(true))
    .addStringOption((o) => o.setName("prize").setDescription("What are you giving away?").setRequired(true))
    .addIntegerOption((o) => o.setName("winners").setDescription("Number of winners (default 1)").setMinValue(1).setMaxValue(20).setRequired(false)),

  new SlashCommandBuilder().setName("gend").setDescription("End a giveaway early").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((o) => o.setName("messageid").setDescription("Giveaway message ID").setRequired(true)),

  new SlashCommandBuilder().setName("greroll").setDescription("Reroll giveaway winners").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((o) => o.setName("messageid").setDescription("Giveaway message ID").setRequired(true))
    .addIntegerOption((o) => o.setName("winners").setDescription("Number of winners to reroll").setMinValue(1).setMaxValue(20).setRequired(false)),

  // ── Leaderboard ────────────────────────────────────────────────────────────
  new SlashCommandBuilder().setName("setlb").setDescription("Set a live auto-updating leaderboard channel").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption((o) => o.setName("channel").setDescription("Channel for the live leaderboard (omit to disable)").setRequired(false))
    .addStringOption((o) => o.setName("type").setDescription("Type").setRequired(false).addChoices({ name: "💬 Chat", value: "chat" }, { name: "🎙️ Voice", value: "vc" }))
    .addStringOption((o) => o.setName("period").setDescription("Period").setRequired(false).addChoices({ name: "📅 Today", value: "daily" }, { name: "📆 Weekly", value: "weekly" }, { name: "🗓️ Monthly", value: "monthly" }, { name: "🏆 All Time", value: "lifetime" })),

  new SlashCommandBuilder().setName("lbreset").setDescription("Reset leaderboard stats").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((o) => o.setName("period").setDescription("Period to reset").setRequired(true).addChoices({ name: "📅 Daily", value: "daily" }, { name: "📆 Weekly", value: "weekly" }, { name: "🗓️ Monthly", value: "monthly" }, { name: "🏆 All Time", value: "all" })),

  // ── Fun / Games ────────────────────────────────────────────────────────────
  new SlashCommandBuilder().setName("wordbomb").setDescription("Start a Word Bomb game").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder().setName("wordbombstop").setDescription("Stop the current Word Bomb game").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder().setName("wbtop").setDescription("Show the Word Bomb win leaderboard"),

  new SlashCommandBuilder().setName("calc").setDescription("Calculate a math expression")
    .addStringOption((o) => o.setName("expression").setDescription("Math expression (e.g. sqrt(144), 2^10, PI * 5^2)").setRequired(true)),

  new SlashCommandBuilder().setName("afk").setDescription("Set your AFK status")
    .addStringOption((o) => o.setName("status").setDescription("AFK status message (default: AFK)").setRequired(false)),

  // ── Utility ────────────────────────────────────────────────────────────────
  new SlashCommandBuilder().setName("nick").setDescription("Change a user's nickname").setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames)
    .addUserOption((o) => o.setName("user").setDescription("User to nickname").setRequired(true))
    .addStringOption((o) => o.setName("name").setDescription("New nickname (or 'reset' to clear)").setRequired(true)),

  new SlashCommandBuilder().setName("roleicon").setDescription("Set or remove a role's icon (requires Server Level 2)").setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addRoleOption((o) => o.setName("role").setDescription("Role to update").setRequired(true))
    .addStringOption((o) => o.setName("emoji").setDescription("Unicode emoji to set as icon — omit to remove the current icon").setRequired(false)),

  new SlashCommandBuilder().setName("role").setDescription("Toggle a role on a user").setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addUserOption((o) => o.setName("user").setDescription("User to modify").setRequired(true))
    .addRoleOption((o) => o.setName("role").setDescription("Role to toggle").setRequired(true)),

  new SlashCommandBuilder().setName("color").setDescription("Preview a hex color with RGB breakdown")
    .addStringOption((o) => o.setName("hex").setDescription("Hex color (e.g. #ff0000 or ff0000)").setRequired(true)),

  new SlashCommandBuilder().setName("banner").setDescription("Show the server banner or a user's banner")
    .addUserOption((o) => o.setName("user").setDescription("User for banner (omit for server banner)").setRequired(false)),

  new SlashCommandBuilder().setName("hide").setDescription("Hide or unhide this channel for a specific user").setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addUserOption((o) => o.setName("user").setDescription("User to hide/unhide the channel for").setRequired(true))
    .addBooleanOption((o) => o.setName("unhide").setDescription("Unhide instead of hide (default: false)").setRequired(false)),

  new SlashCommandBuilder().setName("steal").setDescription("Steal a custom emoji and add it to this server").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuildExpressions)
    .addStringOption((o) => o.setName("emoji").setDescription("Custom emoji to steal (e.g. <:name:id> or <a:name:id>)").setRequired(true))
    .addStringOption((o) => o.setName("name").setDescription("New name for the emoji (default: original name)").setRequired(false)),

  new SlashCommandBuilder().setName("emoji").setDescription("Show info about a custom emoji")
    .addStringOption((o) => o.setName("emoji").setDescription("Custom emoji to inspect").setRequired(true)),

  // ── Config ─────────────────────────────────────────────────────────────────
  new SlashCommandBuilder().setName("setwelcome").setDescription("Configure welcome messages").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) => s.setName("channel").setDescription("Set the welcome channel").addChannelOption((o) => o.setName("channel").setDescription("Channel").setRequired(true)))
    .addSubcommand((s) => s.setName("message").setDescription("Set the welcome message text").addStringOption((o) => o.setName("text").setDescription("Message (use {user} {username} {server} {count})").setRequired(true)))
    .addSubcommand((s) => s.setName("test").setDescription("Preview the welcome message"))
    .addSubcommand((s) => s.setName("disable").setDescription("Disable welcome messages")),

  new SlashCommandBuilder().setName("setleave").setDescription("Configure leave messages").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) => s.setName("channel").setDescription("Set the leave channel").addChannelOption((o) => o.setName("channel").setDescription("Channel").setRequired(true)))
    .addSubcommand((s) => s.setName("message").setDescription("Set the leave message text").addStringOption((o) => o.setName("text").setDescription("Message (use {user} {username} {server} {count})").setRequired(true)))
    .addSubcommand((s) => s.setName("test").setDescription("Preview the leave message"))
    .addSubcommand((s) => s.setName("disable").setDescription("Disable leave messages")),

  new SlashCommandBuilder().setName("setprefix").setDescription("Set a custom command prefix for this server").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((o) => o.setName("prefix").setDescription('New prefix (e.g. "." or ">" or "?") — max 5 characters').setRequired(true).setMaxLength(5)),

  new SlashCommandBuilder().setName("noprefix").setDescription("Configure the no-prefix role").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) => s.setName("set").setDescription("Set the no-prefix role").addRoleOption((o) => o.setName("role").setDescription("Role").setRequired(true)))
    .addSubcommand((s) => s.setName("remove").setDescription("Remove the no-prefix role"))
    .addSubcommand((s) => s.setName("status").setDescription("View current no-prefix role")),

  new SlashCommandBuilder().setName("vanityrole").setDescription("Configure the vanity role system").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) => s.setName("set").setDescription("Set the role to give").addRoleOption((o) => o.setName("role").setDescription("Role").setRequired(true)))
    .addSubcommand((s) => s.setName("url").setDescription("Set the vanity code to scan for").addStringOption((o) => o.setName("code").setDescription("Vanity code").setRequired(true)))
    .addSubcommand((s) => s.setName("check").setDescription("Scan all members and update the vanity role now"))
    .addSubcommand((s) => s.setName("disable").setDescription("Disable the vanity role system")),

  new SlashCommandBuilder().setName("trigger").setDescription("Manage auto-triggers").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) => s.setName("add").setDescription("Add a trigger")
      .addStringOption((o) => o.setName("type").setDescription("Trigger type").setRequired(true).addChoices({ name: "Reply", value: "reply" }, { name: "React", value: "react" }))
      .addStringOption((o) => o.setName("keyword").setDescription("Keyword to trigger on").setRequired(true))
      .addStringOption((o) => o.setName("value").setDescription("Response text or emoji").setRequired(true))
      .addBooleanOption((o) => o.setName("exact").setDescription("Exact match only (default: false)").setRequired(false)))
    .addSubcommand((s) => s.setName("list").setDescription("List all triggers"))
    .addSubcommand((s) => s.setName("remove").setDescription("Remove a trigger by ID").addStringOption((o) => o.setName("id").setDescription("Trigger ID").setRequired(true)))
    .addSubcommand((s) => s.setName("clear").setDescription("Remove all triggers")),

  new SlashCommandBuilder().setName("rr").setDescription("Manage reaction roles").setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addSubcommand((s) => s.setName("add").setDescription("Add a reaction role")
      .addStringOption((o) => o.setName("messageid").setDescription("Message ID").setRequired(true))
      .addStringOption((o) => o.setName("emoji").setDescription("Emoji").setRequired(true))
      .addRoleOption((o) => o.setName("role").setDescription("Role to give").setRequired(true)))
    .addSubcommand((s) => s.setName("remove").setDescription("Remove a reaction role")
      .addStringOption((o) => o.setName("messageid").setDescription("Message ID").setRequired(true))
      .addStringOption((o) => o.setName("emoji").setDescription("Emoji").setRequired(true)))
    .addSubcommand((s) => s.setName("list").setDescription("List all reaction roles"))
    .addSubcommand((s) => s.setName("clear").setDescription("Remove all reaction roles from a message").addStringOption((o) => o.setName("messageid").setDescription("Message ID").setRequired(true))),

  new SlashCommandBuilder().setName("ticket").setDescription("Manage the ticket system").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) => s.setName("setup").setDescription("Post the ticket panel in this channel").addRoleOption((o) => o.setName("supportrole").setDescription("Support role (optional)").setRequired(false)))
    .addSubcommand((s) => s.setName("category").setDescription("Set category for new tickets").addStringOption((o) => o.setName("id").setDescription("Category ID").setRequired(true)))
    .addSubcommand((s) => s.setName("logs").setDescription("Set transcript log channel").addChannelOption((o) => o.setName("channel").setDescription("Log channel").setRequired(true)))
    .addSubcommand((s) => s.setName("add").setDescription("Add a user to this ticket").addUserOption((o) => o.setName("user").setDescription("User to add").setRequired(true)))
    .addSubcommand((s) => s.setName("remove").setDescription("Remove a user from this ticket").addUserOption((o) => o.setName("user").setDescription("User to remove").setRequired(true)))
    .addSubcommand((s) => s.setName("close").setDescription("Close this ticket")),

  // ── Social Reactions (grouped) ──────────────────────────────────────────────
  new SlashCommandBuilder().setName("social").setDescription("Anime-style social reactions")
    .addSubcommand((s) => s.setName("hug").setDescription("Hug someone with an anime GIF! 🤗").addUserOption((o) => o.setName("user").setDescription("Who to hug").setRequired(true)))
    .addSubcommand((s) => s.setName("kiss").setDescription("Kiss someone! 💋").addUserOption((o) => o.setName("user").setDescription("Who to kiss").setRequired(true)))
    .addSubcommand((s) => s.setName("slap").setDescription("Slap someone! 👋").addUserOption((o) => o.setName("user").setDescription("Who to slap").setRequired(true)))
    .addSubcommand((s) => s.setName("pat").setDescription("Pat someone on the head! ✋").addUserOption((o) => o.setName("user").setDescription("Who to pat").setRequired(true)))
    .addSubcommand((s) => s.setName("poke").setDescription("Poke someone! 👉").addUserOption((o) => o.setName("user").setDescription("Who to poke").setRequired(true)))
    .addSubcommand((s) => s.setName("cuddle").setDescription("Cuddle someone! 🥰").addUserOption((o) => o.setName("user").setDescription("Who to cuddle").setRequired(true)))
    .addSubcommand((s) => s.setName("bite").setDescription("Bite someone! 😬").addUserOption((o) => o.setName("user").setDescription("Who to bite").setRequired(true)))
    .addSubcommand((s) => s.setName("bonk").setDescription("Bonk someone! 🔨").addUserOption((o) => o.setName("user").setDescription("Who to bonk").setRequired(true)))
    .addSubcommand((s) => s.setName("kill").setDescription("Eliminate someone! ☠️").addUserOption((o) => o.setName("user").setDescription("Who to eliminate").setRequired(true)))
    .addSubcommand((s) => s.setName("wave").setDescription("Wave at someone! 👋").addUserOption((o) => o.setName("user").setDescription("Who to wave at (optional)").setRequired(false)))
    .addSubcommand((s) => s.setName("cry").setDescription("Express your feelings 😢"))
    .addSubcommand((s) => s.setName("highfive").setDescription("High five someone! ✋").addUserOption((o) => o.setName("user").setDescription("Who to high five").setRequired(true)))
    .addSubcommand((s) => s.setName("boop").setDescription("Boop someone on the nose! 👆").addUserOption((o) => o.setName("user").setDescription("Who to boop").setRequired(true)))
    .addSubcommand((s) => s.setName("lick").setDescription("Lick someone! 👅").addUserOption((o) => o.setName("user").setDescription("Who to lick").setRequired(true)))
    .addSubcommand((s) => s.setName("nuzzle").setDescription("Nuzzle someone! 🐾").addUserOption((o) => o.setName("user").setDescription("Who to nuzzle").setRequired(true)))
    .addSubcommand((s) => s.setName("dance").setDescription("Do a little dance! 💃"))
    .addSubcommand((s) => s.setName("stare").setDescription("Stare at someone 👀").addUserOption((o) => o.setName("user").setDescription("Who to stare at (optional)").setRequired(false)))
    .addSubcommand((s) => s.setName("tickle").setDescription("Tickle someone! 🤭").addUserOption((o) => o.setName("user").setDescription("Who to tickle").setRequired(true)))
    .addSubcommand((s) => s.setName("wink").setDescription("Wink at someone 😉").addUserOption((o) => o.setName("user").setDescription("Who to wink at (optional)").setRequired(false)))
    .addSubcommand((s) => s.setName("blush").setDescription("Blush shyly 😳"))
    .addSubcommand((s) => s.setName("yeet").setDescription("Yeet someone into the void! 🌀").addUserOption((o) => o.setName("user").setDescription("Who to yeet").setRequired(true)))
    .addSubcommand((s) => s.setName("nom").setDescription("Nom nom nom someone! 😋").addUserOption((o) => o.setName("user").setDescription("Who to nom").setRequired(true)))
    .addSubcommand((s) => s.setName("throw").setDescription("Throw something at someone! 🎯").addUserOption((o) => o.setName("user").setDescription("Who to throw at").setRequired(true)))
    .addSubcommand((s) => s.setName("smile").setDescription("Flash a smile! 😊"))
    .addSubcommand((s) => s.setName("happy").setDescription("Show your happiness! 🎉")),

  // ── Security ────────────────────────────────────────────────────────────────
  new SlashCommandBuilder().setName("antinuke").setDescription("Manage anti-nuke protection").setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((s) => s.setName("enable").setDescription("Enable anti-nuke protection"))
    .addSubcommand((s) => s.setName("disable").setDescription("Disable anti-nuke protection"))
    .addSubcommand((s) => s.setName("status").setDescription("Show current anti-nuke configuration"))
    .addSubcommand((s) => s.setName("action").setDescription("Set the punishment for nukers")
      .addStringOption((o) => o.setName("type").setDescription("Punishment type").setRequired(true).addChoices(
        { name: "🔨 Ban (strip roles + ban)", value: "ban" },
        { name: "👢 Kick (strip roles + kick)", value: "kick" },
        { name: "🎭 Derank (strip roles only)", value: "derank" },
      )))
    .addSubcommand((s) => s.setName("whitelist").setDescription("Toggle a user in/out of the whitelist")
      .addUserOption((o) => o.setName("user").setDescription("User to whitelist").setRequired(true)))
    .addSubcommand((s) => s.setName("logs").setDescription("Set anti-nuke log channel")
      .addChannelOption((o) => o.setName("channel").setDescription("Log channel").setRequired(true)))
    .addSubcommand((s) => s.setName("threshold").setDescription("Set trigger threshold per 10 seconds")
      .addStringOption((o) => o.setName("action").setDescription("What action to limit").setRequired(true).addChoices(
        { name: "ban", value: "ban" },
        { name: "kick", value: "kick" },
        { name: "channel delete", value: "channel" },
        { name: "role delete", value: "role" },
      ))
      .addIntegerOption((o) => o.setName("count").setDescription("Max actions in 10s before punishment triggers").setMinValue(1).setMaxValue(20).setRequired(true))),

  new SlashCommandBuilder().setName("automod").setDescription("Manage auto-moderation").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) => s.setName("enable").setDescription("Enable automod"))
    .addSubcommand((s) => s.setName("disable").setDescription("Disable automod"))
    .addSubcommand((s) => s.setName("status").setDescription("Show automod configuration"))
    .addSubcommand((s) => s.setName("invites").setDescription("Block Discord invite links")
      .addStringOption((o) => o.setName("toggle").setDescription("on or off").setRequired(true).addChoices({ name: "on", value: "on" }, { name: "off", value: "off" })))
    .addSubcommand((s) => s.setName("links").setDescription("Block all external links")
      .addStringOption((o) => o.setName("toggle").setDescription("on or off").setRequired(true).addChoices({ name: "on", value: "on" }, { name: "off", value: "off" })))
    .addSubcommand((s) => s.setName("spam").setDescription("Set spam threshold (msgs per 5s)")
      .addIntegerOption((o) => o.setName("count").setDescription("Messages before mute (2–20)").setMinValue(2).setMaxValue(20).setRequired(true)))
    .addSubcommand((s) => s.setName("caps").setDescription("Block excessive caps messages")
      .addIntegerOption((o) => o.setName("percent").setDescription("Caps % threshold (10–100, or 0 to disable)").setMinValue(0).setMaxValue(100).setRequired(true)))
    .addSubcommand((s) => s.setName("logs").setDescription("Set automod log channel")
      .addChannelOption((o) => o.setName("channel").setDescription("Log channel").setRequired(true))),

  new SlashCommandBuilder().setName("setup").setDescription("Auto-create server structure (roles, categories, channels)").setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  // ── Extended Moderation ───────────────────────────────────────────────────
  new SlashCommandBuilder().setName("softban").setDescription("Ban then immediately unban a member (deletes messages, they can rejoin)").setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption((o) => o.setName("user").setDescription("Member to softban").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("Reason").setRequired(false)),

  new SlashCommandBuilder().setName("hackban").setDescription("Ban a user by ID even if they are not in this server").setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addStringOption((o) => o.setName("userid").setDescription("User ID to ban").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("Reason").setRequired(false)),

  new SlashCommandBuilder().setName("vmute").setDescription("Server-mute a member in voice").setDefaultMemberPermissions(PermissionFlagsBits.MuteMembers)
    .addUserOption((o) => o.setName("user").setDescription("Member to voice-mute").setRequired(true)),

  new SlashCommandBuilder().setName("vunmute").setDescription("Remove server-mute from a member in voice").setDefaultMemberPermissions(PermissionFlagsBits.MuteMembers)
    .addUserOption((o) => o.setName("user").setDescription("Member to voice-unmute").setRequired(true)),

  new SlashCommandBuilder().setName("deafen").setDescription("Server-deafen a member in voice").setDefaultMemberPermissions(PermissionFlagsBits.DeafenMembers)
    .addUserOption((o) => o.setName("user").setDescription("Member to deafen").setRequired(true)),

  new SlashCommandBuilder().setName("undeafen").setDescription("Remove server-deafen from a member in voice").setDefaultMemberPermissions(PermissionFlagsBits.DeafenMembers)
    .addUserOption((o) => o.setName("user").setDescription("Member to undeafen").setRequired(true)),

  new SlashCommandBuilder().setName("move").setDescription("Move a member to another voice channel").setDefaultMemberPermissions(PermissionFlagsBits.MoveMembers)
    .addUserOption((o) => o.setName("user").setDescription("Member to move").setRequired(true))
    .addChannelOption((o) => o.setName("channel").setDescription("Destination voice channel").addChannelTypes(ChannelType.GuildVoice).setRequired(true)),

  new SlashCommandBuilder().setName("voicekick").setDescription("Disconnect a member from voice").setDefaultMemberPermissions(PermissionFlagsBits.MoveMembers)
    .addUserOption((o) => o.setName("user").setDescription("Member to disconnect").setRequired(true)),

  new SlashCommandBuilder().setName("banlist").setDescription("Show the list of banned users in this server").setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  new SlashCommandBuilder().setName("clearreactions").setDescription("Clear all reactions from a message").setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption((o) => o.setName("messageid").setDescription("ID of the message to clear reactions from").setRequired(true)),

  // ── Utility ───────────────────────────────────────────────────────────────
  new SlashCommandBuilder().setName("roleinfo").setDescription("Show information about a role")
    .addRoleOption((o) => o.setName("role").setDescription("Role to inspect").setRequired(true)),

  new SlashCommandBuilder().setName("channelinfo").setDescription("Show information about a channel")
    .addChannelOption((o) => o.setName("channel").setDescription("Channel to inspect (default: current)").setRequired(false)),

  new SlashCommandBuilder().setName("inviteinfo").setDescription("Look up an invite code or URL")
    .addStringOption((o) => o.setName("code").setDescription("Invite code or discord.gg URL").setRequired(true)),

  new SlashCommandBuilder().setName("invites").setDescription("Show how many server invites a user has")
    .addUserOption((o) => o.setName("user").setDescription("User to check (default: yourself)").setRequired(false)),

  new SlashCommandBuilder().setName("permissions").setDescription("Show a member's server permissions")
    .addUserOption((o) => o.setName("user").setDescription("Member to check (default: yourself)").setRequired(false)),

  new SlashCommandBuilder().setName("inrole").setDescription("List all members who have a specific role")
    .addRoleOption((o) => o.setName("role").setDescription("Role to list members for").setRequired(true)),

  new SlashCommandBuilder().setName("boosters").setDescription("List all current server boosters"),

  new SlashCommandBuilder().setName("firstmsg").setDescription("Jump to the first message in a channel")
    .addChannelOption((o) => o.setName("channel").setDescription("Channel to check (default: current)").setRequired(false)),

  // ── Config ────────────────────────────────────────────────────────────────
  new SlashCommandBuilder().setName("autorole").setDescription("Manage roles automatically given to new members").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) => s.setName("set").setDescription("Add a role to give new members")
      .addRoleOption((o) => o.setName("role").setDescription("Role to auto-assign").setRequired(true)))
    .addSubcommand((s) => s.setName("remove").setDescription("Remove an auto-role")
      .addRoleOption((o) => o.setName("role").setDescription("Role to remove").setRequired(true)))
    .addSubcommand((s) => s.setName("list").setDescription("List all configured auto-roles")),

  new SlashCommandBuilder().setName("sticky").setDescription("Manage sticky messages that re-post when new messages arrive").setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand((s) => s.setName("set").setDescription("Set a sticky message in this channel")
      .addStringOption((o) => o.setName("message").setDescription("Sticky message content").setRequired(true)))
    .addSubcommand((s) => s.setName("remove").setDescription("Remove the sticky message from this channel"))
    .addSubcommand((s) => s.setName("list").setDescription("List all sticky messages in this server")),

  new SlashCommandBuilder().setName("autoreact").setDescription("Manage automatic emoji reactions in channels").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) => s.setName("set").setDescription("Add an auto-react emoji to a channel")
      .addStringOption((o) => o.setName("emoji").setDescription("Emoji to auto-react with").setRequired(true))
      .addChannelOption((o) => o.setName("channel").setDescription("Channel (default: current)").setRequired(false)))
    .addSubcommand((s) => s.setName("remove").setDescription("Remove an auto-react emoji from a channel")
      .addChannelOption((o) => o.setName("channel").setDescription("Channel (default: current)").setRequired(false))
      .addStringOption((o) => o.setName("emoji").setDescription("Specific emoji to remove (omit to remove all)").setRequired(false)))
    .addSubcommand((s) => s.setName("list").setDescription("List all auto-reacts in this server")),

  // ── Fun / Text (grouped) ──────────────────────────────────────────────────
  new SlashCommandBuilder().setName("fun").setDescription("Fun commands: jokes, quotes, facts, roasts and more")
    .addSubcommand((s) => s.setName("joke").setDescription("Get a random joke"))
    .addSubcommand((s) => s.setName("dadjoke").setDescription("Get a random dad joke"))
    .addSubcommand((s) => s.setName("fact").setDescription("Get a random interesting fact"))
    .addSubcommand((s) => s.setName("quote").setDescription("Get an inspirational quote"))
    .addSubcommand((s) => s.setName("topic").setDescription("Get a random conversation starter"))
    .addSubcommand((s) => s.setName("roast").setDescription("Roast someone (or yourself)").addUserOption((o) => o.setName("user").setDescription("Who to roast (default: yourself)").setRequired(false)))
    .addSubcommand((s) => s.setName("compliment").setDescription("Give someone a compliment").addUserOption((o) => o.setName("user").setDescription("Who to compliment (default: yourself)").setRequired(false)))
    .addSubcommand((s) => s.setName("ship").setDescription("Check compatibility between two users").addUserOption((o) => o.setName("user1").setDescription("First person").setRequired(true)).addUserOption((o) => o.setName("user2").setDescription("Second person").setRequired(true)))
    .addSubcommand((s) => s.setName("rate").setDescription("Rate anything out of 10").addStringOption((o) => o.setName("thing").setDescription("What to rate").setRequired(true))),

  // ── Text Transform (grouped) ───────────────────────────────────────────────
  new SlashCommandBuilder().setName("textify").setDescription("Text transformation tools")
    .addSubcommand((s) => s.setName("reverse").setDescription("Reverse a piece of text").addStringOption((o) => o.setName("text").setDescription("Text to reverse").setRequired(true)))
    .addSubcommand((s) => s.setName("mock").setDescription("Mock text in aLtErNaTiNg CaSe").addStringOption((o) => o.setName("text").setDescription("Text to mock").setRequired(true)))
    .addSubcommand((s) => s.setName("clap").setDescription("Add 👏 claps 👏 between 👏 words").addStringOption((o) => o.setName("text").setDescription("Text to clap").setRequired(true)))
    .addSubcommand((s) => s.setName("upper").setDescription("Convert text to UPPERCASE").addStringOption((o) => o.setName("text").setDescription("Text to convert").setRequired(true)))
    .addSubcommand((s) => s.setName("lower").setDescription("Convert text to lowercase").addStringOption((o) => o.setName("text").setDescription("Text to convert").setRequired(true)))
    .addSubcommand((s) => s.setName("emojify").setDescription("Convert text to letter emoji").addStringOption((o) => o.setName("text").setDescription("Text to emojify").setRequired(true)))
    .addSubcommand((s) => s.setName("binary").setDescription("Convert text to binary").addStringOption((o) => o.setName("text").setDescription("Text to convert").setRequired(true)))
    .addSubcommand((s) => s.setName("morse").setDescription("Convert text to Morse code").addStringOption((o) => o.setName("text").setDescription("Text to convert").setRequired(true)))
    .addSubcommand((s) => s.setName("base64").setDescription("Encode or decode Base64 text")
      .addStringOption((o) => o.setName("mode").setDescription("Encode or decode").setRequired(true).addChoices({ name: "Encode", value: "encode" }, { name: "Decode", value: "decode" }))
      .addStringOption((o) => o.setName("text").setDescription("Text to process").setRequired(true)))
    .addSubcommand((s) => s.setName("length").setDescription("Count characters, words and lines in text").addStringOption((o) => o.setName("text").setDescription("Text to measure").setRequired(true))),

  // ── Generate (grouped) ─────────────────────────────────────────────────────
  new SlashCommandBuilder().setName("gen").setDescription("Generate random things: passwords, numbers, and more")
    .addSubcommand((s) => s.setName("password").setDescription("Generate a secure random password").addIntegerOption((o) => o.setName("length").setDescription("Password length 4–64 (default: 16)").setMinValue(4).setMaxValue(64).setRequired(false)))
    .addSubcommand((s) => s.setName("number").setDescription("Generate a random number in a range").addIntegerOption((o) => o.setName("min").setDescription("Minimum value (default: 1)").setRequired(false)).addIntegerOption((o) => o.setName("max").setDescription("Maximum value (default: 100)").setRequired(false)))
    .addSubcommand((s) => s.setName("percent").setDescription("Get a random percentage"))
    .addSubcommand((s) => s.setName("yesno").setDescription("Get a random yes or no answer")),

  // ── Lookup (grouped) ───────────────────────────────────────────────────────
  new SlashCommandBuilder().setName("lookup").setDescription("Look up definitions and articles")
    .addSubcommand((s) => s.setName("urban").setDescription("Look up a word on Urban Dictionary").addStringOption((o) => o.setName("term").setDescription("Word or phrase to look up").setRequired(true)))
    .addSubcommand((s) => s.setName("wiki").setDescription("Get a Wikipedia summary for a topic").addStringOption((o) => o.setName("topic").setDescription("Topic to search").setRequired(true))),

  // ── Convert (grouped) ──────────────────────────────────────────────────────
  new SlashCommandBuilder().setName("convert").setDescription("Unit conversion tools")
    .addSubcommand((s) => s.setName("temp").setDescription("Convert a temperature between °C, °F and K")
      .addNumberOption((o) => o.setName("value").setDescription("Temperature value to convert").setRequired(true))
      .addStringOption((o) => o.setName("unit").setDescription("Unit of the input value").setRequired(true).addChoices({ name: "Celsius (°C)", value: "c" }, { name: "Fahrenheit (°F)", value: "f" }, { name: "Kelvin (K)", value: "k" }))),

  // ── Animals (grouped) ──────────────────────────────────────────────────────
  new SlashCommandBuilder().setName("animal").setDescription("Get random animal images")
    .addSubcommand((s) => s.setName("cat").setDescription("Get a random cat image"))
    .addSubcommand((s) => s.setName("dog").setDescription("Get a random dog image"))
    .addSubcommand((s) => s.setName("fox").setDescription("Get a random fox image"))
    .addSubcommand((s) => s.setName("duck").setDescription("Get a random duck image")),

  // ── Games ─────────────────────────────────────────────────────────────────
  new SlashCommandBuilder().setName("rps").setDescription("Play Rock Paper Scissors against the bot")
    .addStringOption((o) => o.setName("choice").setDescription("Your move").setRequired(true)
      .addChoices({ name: "Rock 🪨", value: "rock" }, { name: "Paper 📄", value: "paper" }, { name: "Scissors ✂️", value: "scissors" })),

  new SlashCommandBuilder().setName("slots").setDescription("Spin the slot machine"),
  new SlashCommandBuilder().setName("trivia").setDescription("Get a trivia question in the channel"),

  new SlashCommandBuilder().setName("guess").setDescription("Start a number guessing game in the channel")
    .addIntegerOption((o) => o.setName("max").setDescription("Guess a number up to this value (default: 100)").setMinValue(2).setMaxValue(10000).setRequired(false)),
];

export async function registerSlashCommands(client: Client): Promise<void> {
  const token = process.env["DISCORD_BOT_TOKEN"];
  if (!token || !client.user) return;
  try {
    const rest = new REST({ version: "10" }).setToken(token);
    await rest.put(Routes.applicationCommands(client.user.id), { body: commandDefs.map((c) => c.toJSON()) });
    logger.info("Slash commands registered globally");
  } catch (err) {
    logger.error({ err }, "Failed to register slash commands");
  }
}

const EIGHT_BALL = [
  "🟢 It is certain.", "🟢 Without a doubt.", "🟢 Yes, definitely.", "🟢 Most likely.",
  "🟢 Outlook good.", "🟢 Signs point to yes.", "🟡 Reply hazy, try again.",
  "🟡 Ask again later.", "🟡 Cannot predict now.", "🔴 Don't count on it.",
  "🔴 My reply is no.", "🔴 Outlook not so good.", "🔴 Very doubtful.",
];

export async function handleSlashCommand(client: Client, interaction: ChatInputCommandInteraction): Promise<void> {
  const { commandName, guild } = interaction;

  try {
    switch (commandName) {

      // ── Messaging ──────────────────────────────────────────────────────────
      case "send": {
        await interaction.deferReply({ ephemeral: true });
        const raw = sanitize(interaction.options.getString("content", true));
        const ch = (interaction.options.getChannel("channel") ?? interaction.channel) as TextChannel;
        if (!ch?.isTextBased()) { await interaction.editReply("❌ Invalid channel."); return; }
        await ch.send({ content: raw, allowedMentions: NO_PING });
        await interaction.editReply(`✅ Sent to ${ch}.`);
        break;
      }
      case "say": {
        await interaction.deferReply({ ephemeral: true });
        const text = sanitize(interaction.options.getString("message", true));
        await (interaction.channel as TextChannel).send({ content: text, allowedMentions: NO_PING });
        await interaction.editReply("✅ Done.");
        break;
      }
      case "embed": {
        await interaction.deferReply({ ephemeral: true });
        const desc = interaction.options.getString("description", true);
        const title = interaction.options.getString("title");
        const footer = interaction.options.getString("footer");
        const ch = (interaction.options.getChannel("channel") ?? interaction.channel) as TextChannel;
        if (!ch?.isTextBased()) { await interaction.editReply("❌ Invalid channel."); return; }
        const emb = new EmbedBuilder().setColor(C).setDescription(desc).setTimestamp();
        if (title) emb.setTitle(title);
        if (footer) emb.setFooter({ text: footer });
        await ch.send({ embeds: [emb] });
        await interaction.editReply(`✅ Embed sent to ${ch}.`);
        break;
      }
      case "dm": {
        await interaction.deferReply({ ephemeral: true });
        const target = interaction.options.getUser("user", true);
        const text = interaction.options.getString("message", true);
        try {
          await target.send({ embeds: [new EmbedBuilder().setColor(C).setTitle(`📩 Message from ${guild?.name ?? "the server"}`).setDescription(text).setFooter({ text: `Sent by ${interaction.user.tag}` }).setTimestamp()] });
          await interaction.editReply(`✅ DM sent to **${target.username}**.`);
        } catch { await interaction.editReply("❌ Could not DM that user — they may have DMs disabled."); }
        break;
      }
      case "repeat": {
        await interaction.deferReply({ ephemeral: true });
        const times = interaction.options.getInteger("times", true);
        const text = sanitize(interaction.options.getString("message", true));
        for (let i = 0; i < times; i++) await (interaction.channel as TextChannel).send({ content: text, allowedMentions: NO_PING });
        await interaction.editReply(`✅ Sent ${times} time${times > 1 ? "s" : ""}.`);
        break;
      }
      case "announce": {
        await interaction.deferReply({ ephemeral: true });
        const ch = interaction.options.getChannel("channel", true) as TextChannel;
        const text = interaction.options.getString("message", true);
        await ch.send({ embeds: [new EmbedBuilder().setColor(C).setDescription(text).setFooter({ text: `Announced by ${interaction.user.username}` }).setTimestamp()] });
        await interaction.editReply(`✅ Announcement sent to ${ch}.`);
        break;
      }
      case "snipe": {
        const snipedMsg = sniped.get(interaction.channelId);
        if (!snipedMsg) { await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("🔍 Nothing to snipe!")], ephemeral: true }); return; }
        const e = new EmbedBuilder().setColor(C).setAuthor({ name: snipedMsg.authorTag, iconURL: snipedMsg.authorAvatar ?? undefined }).setDescription(snipedMsg.content || "*[no text]*").setFooter({ text: "Deleted message" }).setTimestamp(snipedMsg.deletedAt);
        if (snipedMsg.imageUrl) e.setImage(snipedMsg.imageUrl);
        await interaction.reply({ embeds: [e] });
        break;
      }

      // ── Moderation ─────────────────────────────────────────────────────────
      case "warn": {
        if (!guild) { await interaction.reply({ content: "❌ Server only.", ephemeral: true }); return; }
        await interaction.deferReply({ ephemeral: true });
        const user = interaction.options.getUser("user", true);
        const reason = interaction.options.getString("reason") ?? "No reason provided";
        if (user.bot) { await interaction.editReply("❌ Cannot warn a bot."); return; }
        const member = guild.members.cache.get(user.id) ?? await guild.members.fetch(user.id).catch(() => null);
        if (!member) { await interaction.editReply("❌ Member not found."); return; }
        await addWarningToDb(guild.id, user.id, interaction.user.id, reason);
        const c = await logCase(client, { type: "WARN", guildId: guild.id, targetId: user.id, targetTag: user.tag, moderatorId: interaction.user.id, reason });
        await user.send({ embeds: [new EmbedBuilder().setColor(0xffa500).setTitle(`⚠️ You were warned in ${guild.name}`).addFields({ name: "Reason", value: reason })] }).catch(() => {});
        const warns = await getWarningsFromDb(guild.id, user.id);
        await interaction.editReply(`⚠️ **${user.username}** warned. Case **#${c.id}** | Total: **${warns.length}** warning(s).`);
        break;
      }
      case "warnings": {
        if (!guild) { await interaction.reply({ content: "❌ Server only.", ephemeral: true }); return; }
        const user = interaction.options.getUser("user", true);
        const warns = await getWarningsFromDb(guild.id, user.id);
        if (warns.length === 0) { await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x57f287).setDescription(`✅ **${user.username}** has no warnings.`)], ephemeral: true }); return; }
        const list = warns.map((w, i) => `**${i + 1}.** ${w.reason} — <t:${Math.floor(w.timestamp / 1000)}:R> by <@${w.moderatorId}>`).join("\n");
        await interaction.reply({ embeds: [new EmbedBuilder().setColor(0xffa500).setTitle(`⚠️ Warnings for ${user.username}`).setDescription(list).setFooter({ text: `${warns.length} total` })], ephemeral: true });
        break;
      }
      case "clearwarnings": {
        if (!guild) { await interaction.reply({ content: "❌ Server only.", ephemeral: true }); return; }
        const user = interaction.options.getUser("user", true);
        await clearWarningsFromDb(guild.id, user.id);
        await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x57f287).setDescription(`✅ Cleared all warnings for **${user.username}**.`)], ephemeral: true });
        break;
      }
      case "mute": {
        if (!guild) { await interaction.reply({ content: "❌ Server only.", ephemeral: true }); return; }
        await interaction.deferReply({ ephemeral: true });
        const user = interaction.options.getUser("user", true);
        const durStr = interaction.options.getString("duration", true);
        const reason = interaction.options.getString("reason") ?? "No reason provided";
        const ms = parseDur(durStr);
        if (!ms || ms > 28 * 24 * 60 * 60 * 1000) { await interaction.editReply("❌ Invalid duration (max 28d). Use 30s, 5m, 2h, 1d."); return; }
        const member = guild.members.cache.get(user.id) ?? await guild.members.fetch(user.id).catch(() => null) as GuildMember | null;
        if (!member) { await interaction.editReply("❌ Member not found."); return; }
        await member.timeout(ms, reason);
        await logCase(client, { type: "MUTE", guildId: guild.id, targetId: user.id, targetTag: user.tag, moderatorId: interaction.user.id, reason });
        await interaction.editReply(`🔇 **${user.username}** muted for **${durStr}**. Reason: ${reason}`);
        break;
      }
      case "unmute": {
        if (!guild) { await interaction.reply({ content: "❌ Server only.", ephemeral: true }); return; }
        await interaction.deferReply({ ephemeral: true });
        const user = interaction.options.getUser("user", true);
        const member = guild.members.cache.get(user.id) ?? await guild.members.fetch(user.id).catch(() => null) as GuildMember | null;
        if (!member) { await interaction.editReply("❌ Member not found."); return; }
        await member.timeout(null, "Unmuted via slash command");
        await logCase(client, { type: "UNMUTE", guildId: guild.id, targetId: user.id, targetTag: user.tag, moderatorId: interaction.user.id, reason: "Unmuted via slash command" });
        await interaction.editReply(`🔊 **${user.username}** has been unmuted.`);
        break;
      }
      case "kick": {
        if (!guild) { await interaction.reply({ content: "❌ Server only.", ephemeral: true }); return; }
        await interaction.deferReply({ ephemeral: true });
        const user = interaction.options.getUser("user", true);
        const reason = interaction.options.getString("reason") ?? "No reason provided";
        const member = guild.members.cache.get(user.id) ?? await guild.members.fetch(user.id).catch(() => null) as GuildMember | null;
        if (!member) { await interaction.editReply("❌ Member not found."); return; }
        await member.kick(reason);
        await logCase(client, { type: "KICK", guildId: guild.id, targetId: user.id, targetTag: user.tag, moderatorId: interaction.user.id, reason });
        await interaction.editReply(`🥾 **${user.username}** has been kicked. Reason: ${reason}`);
        break;
      }
      case "ban": {
        if (!guild) { await interaction.reply({ content: "❌ Server only.", ephemeral: true }); return; }
        await interaction.deferReply({ ephemeral: true });
        const user = interaction.options.getUser("user", true);
        const reason = interaction.options.getString("reason") ?? "No reason provided";
        await guild.members.ban(user.id, { reason, deleteMessageSeconds: 604800 });
        await logCase(client, { type: "BAN", guildId: guild.id, targetId: user.id, targetTag: user.tag, moderatorId: interaction.user.id, reason });
        await interaction.editReply(`🔨 **${user.username}** has been banned. Reason: ${reason}`);
        break;
      }
      case "unban": {
        if (!guild) { await interaction.reply({ content: "❌ Server only.", ephemeral: true }); return; }
        await interaction.deferReply({ ephemeral: true });
        const userId = interaction.options.getString("userid", true).trim();
        try {
          await guild.bans.remove(userId, "Unbanned via slash command");
          await logCase(client, { type: "UNBAN", guildId: guild.id, targetId: userId, targetTag: userId, moderatorId: interaction.user.id, reason: "Unbanned via slash command" });
          await interaction.editReply(`🔓 User \`${userId}\` has been unbanned.`);
        } catch { await interaction.editReply("❌ Could not unban that user. Check the ID and that they are actually banned."); }
        break;
      }
      case "purge": {
        if (!guild) { await interaction.reply({ content: "❌ Server only.", ephemeral: true }); return; }
        await interaction.deferReply({ ephemeral: true });
        const amount = interaction.options.getInteger("amount", true);
        const ch = interaction.channel as TextChannel;
        const deleted = await ch.bulkDelete(amount, true);
        await interaction.editReply(`✅ Deleted **${deleted.size}** message${deleted.size !== 1 ? "s" : ""}.`);
        break;
      }
      case "purgebot": {
        if (!guild) { await interaction.reply({ content: "❌ Server only.", ephemeral: true }); return; }
        await interaction.deferReply({ ephemeral: true });
        const amount = interaction.options.getInteger("amount") ?? 50;
        const ch = interaction.channel as TextChannel;
        const msgs = await ch.messages.fetch({ limit: amount });
        const botMsgs = msgs.filter((m) => m.author.bot && Date.now() - m.createdTimestamp < 14 * 24 * 60 * 60 * 1000);
        const deleted = await ch.bulkDelete(botMsgs, true);
        await interaction.editReply(`✅ Deleted **${deleted.size}** bot message${deleted.size !== 1 ? "s" : ""}.`);
        break;
      }
      case "nuke": {
        if (!guild) { await interaction.reply({ content: "❌ Server only.", ephemeral: true }); return; }
        const ch = interaction.channel as TextChannel;
        await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("💥 Nuking channel...")], ephemeral: true });
        setTimeout(async () => {
          try {
            const newCh = await ch.clone({ name: ch.name, parent: ch.parent ?? undefined, topic: ch.topic ?? undefined, nsfw: ch.nsfw, rateLimitPerUser: ch.rateLimitPerUser, reason: "Nuke command" });
            await ch.delete("Nuke command");
            await newCh.send({ embeds: [new EmbedBuilder().setColor(C).setDescription("💥 Channel has been **nuked**! ✨")] });
          } catch { /* no perms */ }
        }, 1000);
        break;
      }
      case "slowmode": {
        if (!guild) { await interaction.reply({ content: "❌ Server only.", ephemeral: true }); return; }
        const sec = interaction.options.getInteger("seconds", true);
        const ch = interaction.channel as TextChannel;
        await ch.setRateLimitPerUser(sec, `Set by ${interaction.user.tag}`);
        await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(sec === 0 ? "✅ Slowmode **disabled**." : `✅ Slowmode set to **${sec}s**.`)], ephemeral: true });
        break;
      }
      case "lock": {
        if (!guild) { await interaction.reply({ content: "❌ Server only.", ephemeral: true }); return; }
        const ch = interaction.channel as TextChannel;
        await ch.permissionOverwrites.edit(guild.id, { SendMessages: false }, { reason: `Locked by ${interaction.user.tag}` });
        await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("🔒 Channel **locked** for @everyone.")] });
        break;
      }
      case "unlock": {
        if (!guild) { await interaction.reply({ content: "❌ Server only.", ephemeral: true }); return; }
        const ch = interaction.channel as TextChannel;
        await ch.permissionOverwrites.edit(guild.id, { SendMessages: null }, { reason: `Unlocked by ${interaction.user.tag}` });
        await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("🔓 Channel **unlocked** for @everyone.")] });
        break;
      }

      // ── Cases ──────────────────────────────────────────────────────────────
      case "setmodlog": {
        if (!guild) { await interaction.reply({ content: "❌ Server only.", ephemeral: true }); return; }
        const ch = interaction.options.getChannel("channel") as TextChannel | null;
        if (!ch) {
          const cur = await getModlogChannel(guild.id);
          await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(cur ? `📋 Current mod-log: <#${cur}>` : "No mod-log set.")], ephemeral: true });
          return;
        }
        await setModlogChannel(guild.id, ch.id);
        await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(`✅ Mod-log channel set to ${ch}.`)], ephemeral: true });
        break;
      }
      case "case": {
        if (!guild) { await interaction.reply({ content: "❌ Server only.", ephemeral: true }); return; }
        const id = interaction.options.getInteger("id", true);
        const c = await getCase(guild.id, id);
        if (!c) { await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(`❌ Case **#${id}** not found.`)], ephemeral: true }); return; }
        await interaction.reply({
          embeds: [new EmbedBuilder().setColor(CASE_COLORS[c.type]).setTitle(`${CASE_EMOJIS[c.type]} Case #${c.id} — ${c.type}`)
            .addFields({ name: "Member", value: `<@${c.targetId}> \`${c.targetTag}\``, inline: true }, { name: "Moderator", value: `<@${c.moderatorId}>`, inline: true }, { name: "Reason", value: c.reason }, { name: "Date", value: `<t:${Math.floor(c.timestamp / 1000)}:F>` })
            .setFooter({ text: `Case #${c.id}` }).setTimestamp(c.timestamp)], ephemeral: true,
        });
        break;
      }
      case "cases": {
        if (!guild) { await interaction.reply({ content: "❌ Server only.", ephemeral: true }); return; }
        const user = interaction.options.getUser("user");
        const cases = await getRecentCases(guild.id, user?.id ?? null, 10);
        if (cases.length === 0) { await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(user ? `✅ No cases for **${user.username}**.` : "✅ No cases found.")], ephemeral: true }); return; }
        const list = cases.map((c) => `\`#${c.id}\` ${CASE_EMOJIS[c.type]} **${c.type}** — <@${c.targetId}> — ${c.reason.slice(0, 40)}${c.reason.length > 40 ? "…" : ""} <t:${Math.floor(c.timestamp / 1000)}:R>`).join("\n");
        await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setTitle(user ? `📋 Cases for ${user.username}` : "📋 Recent Cases").setDescription(list).setFooter({ text: `${cases.length} most recent` }).setTimestamp()], ephemeral: true });
        break;
      }

      // ── Poll ───────────────────────────────────────────────────────────────
      case "poll": {
        if (!guild) { await interaction.reply({ content: "❌ Server only.", ephemeral: true }); return; }
        const durStr = interaction.options.getString("duration", true);
        const question = interaction.options.getString("question", true);
        const optionsRaw = interaction.options.getString("options");
        const ms = parseDur(durStr);
        if (!ms || ms > 7 * 24 * 60 * 60 * 1000) { await interaction.reply({ content: "❌ Invalid duration (max 7d).", ephemeral: true }); return; }
        const opts = optionsRaw ? optionsRaw.split("|").map((o) => o.trim()).filter(Boolean) : ["Yes", "No"];
        if (opts.length < 2 || opts.length > 10) { await interaction.reply({ content: "❌ Provide 2–10 options.", ephemeral: true }); return; }
        const endAt = Math.floor((Date.now() + ms) / 1000);
        const desc = opts.map((o, i) => `${LETTER_EMOJIS[i]} ${o}`).join("\n");
        await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setTitle(`📊 Poll: ${question}`).setDescription(desc).addFields({ name: "Ends", value: `<t:${endAt}:R>` }).setFooter({ text: "React below to vote!" })] });
        const pollMsg = await interaction.fetchReply();
        for (let i = 0; i < opts.length; i++) await pollMsg.react(LETTER_EMOJIS[i]).catch(() => {});
        setTimeout(async () => {
          try {
            const fetched = await pollMsg.fetch();
            const results = opts.map((o, i) => { const r = fetched.reactions.cache.get(LETTER_EMOJIS[i]); const count = (r?.count ?? 1) - 1; return { option: o, count, emoji: LETTER_EMOJIS[i] }; }).sort((a, b) => b.count - a.count);
            const total = results.reduce((s, r) => s + r.count, 0);
            const lines = results.map((r) => `${r.emoji} **${r.option}** — ${r.count} vote${r.count !== 1 ? "s" : ""} (${total > 0 ? Math.round(r.count / total * 100) : 0}%)`).join("\n");
            await interaction.followUp({ embeds: [new EmbedBuilder().setColor(C).setTitle(`📊 Poll Results: ${question}`).setDescription(lines + `\n\n🏆 **Winner:** ${results[0].emoji} ${results[0].option}`).setFooter({ text: `${total} total vote(s)` }).setTimestamp()] });
          } catch { /* message deleted */ }
        }, ms);
        break;
      }

      // ── Giveaway ───────────────────────────────────────────────────────────
      case "gstart": {
        if (!guild) { await interaction.reply({ content: "❌ Server only.", ephemeral: true }); return; }
        await interaction.deferReply({ ephemeral: true });
        const durStr = interaction.options.getString("duration", true);
        const prize = interaction.options.getString("prize", true);
        const winners = interaction.options.getInteger("winners") ?? 1;
        const duration = parseDuration(durStr);
        if (!duration) { await interaction.editReply("❌ Invalid duration."); return; }
        const result = await startGiveaway(client, interaction.channel as TextChannel, interaction.user.id, guild.id, duration, prize, winners);
        if (result.success) await interaction.editReply(`✅ Giveaway started for **${prize}**!`);
        else await interaction.editReply(`❌ ${result.message}`);
        break;
      }
      case "gend": {
        if (!guild) { await interaction.reply({ content: "❌ Server only.", ephemeral: true }); return; }
        await interaction.deferReply({ ephemeral: true });
        const msgId = interaction.options.getString("messageid", true);
        const result = await endGiveaway(client, msgId);
        await interaction.editReply(result.success ? "✅ Giveaway ended!" : `❌ ${result.message}`);
        break;
      }
      case "greroll": {
        if (!guild) { await interaction.reply({ content: "❌ Server only.", ephemeral: true }); return; }
        await interaction.deferReply({ ephemeral: true });
        const msgId = interaction.options.getString("messageid", true);
        const w = interaction.options.getInteger("winners") ?? undefined;
        const result = await rerollGiveaway(client, msgId, w);
        await interaction.editReply(result.success ? "✅ Rerolled!" : `❌ ${result.message}`);
        break;
      }

      // ── Leaderboard ────────────────────────────────────────────────────────
      case "setlb": {
        if (!guild) { await interaction.reply({ content: "❌ Server only.", ephemeral: true }); return; }
        const ch = interaction.options.getChannel("channel") as TextChannel | null;
        if (!ch) { disableLiveLbConfig(guild.id); await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("✅ Live leaderboard **disabled**.")], ephemeral: true }); return; }
        const stat = (interaction.options.getString("type") ?? "vc") as "chat" | "vc";
        const period = (interaction.options.getString("period") ?? "daily") as "daily" | "weekly" | "monthly" | "lifetime";
        setLiveLbConfig(client, guild.id, ch.id, stat, period);
        await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(`✅ Live leaderboard set!\n**Channel:** ${ch}\n**Type:** ${stat === "chat" ? "💬 Chat" : "🎙️ Voice"}\n**Period:** ${period}\n\nUpdates every **30 seconds**.`)], ephemeral: true });
        break;
      }
      case "lbreset": {
        if (!guild) { await interaction.reply({ content: "❌ Server only.", ephemeral: true }); return; }
        const period = interaction.options.getString("period", true);
        await resetLbStatsForPeriod(guild.id, period);
        await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(`✅ Reset **${period}** leaderboard stats.`)], ephemeral: true });
        break;
      }

      // ── Word Bomb ──────────────────────────────────────────────────────────
      case "wordbomb": {
        if (!guild) { await interaction.reply({ content: "❌ Server only.", ephemeral: true }); return; }
        await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("💣 Starting Word Bomb! React ✅ in the lobby message to join.")], ephemeral: true });
        void startWordbombInChannel(interaction.channel as TextChannel, interaction.user.id, guild.id);
        break;
      }
      case "wordbombstop": {
        if (!guild) { await interaction.reply({ content: "❌ Server only.", ephemeral: true }); return; }
        const stopped = stopWordbombGame(guild.id);
        await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(stopped ? "🛑 Word Bomb game **stopped**." : "❌ No active Word Bomb game.")], ephemeral: true });
        break;
      }
      case "wbtop": {
        if (!guild) { await interaction.reply({ content: "❌ Server only.", ephemeral: true }); return; }
        const wins = await getWbWinsFromDb(guild.id);
        if (wins.length === 0) { await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("📊 No Word Bomb games have been won yet!")] }); return; }
        const medals = ["🥇", "🥈", "🥉"];
        const lines = wins.map(({ userId, wins: w }, i) => `${medals[i] ?? `**${i + 1}.**`} <@${userId}> — **${w}** win${w !== 1 ? "s" : ""}`);
        await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setTitle("🏆 Word Bomb Leaderboard").setDescription(lines.join("\n")).setFooter({ text: "Most wins" })] });
        break;
      }

      // ── Calc ───────────────────────────────────────────────────────────────
      case "calc": {
        const expr = interaction.options.getString("expression", true);
        const { result, error } = safeCalc(expr);
        if (error) { await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(error)], ephemeral: true }); return; }
        await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setTitle("🧮 Calculator").addFields({ name: "Expression", value: `\`${expr}\`` }, { name: "Result", value: `\`\`\`${result}\`\`\`` })] });
        break;
      }

      // ── AFK ────────────────────────────────────────────────────────────────
      case "afk": {
        const status = interaction.options.getString("status") ?? "AFK";
        const userId = interaction.user.id;
        if ((afkUsers as Map<string, { status: string; since: number }>).has(userId)) {
          (afkUsers as Map<string, { status: string; since: number }>).delete(userId);
          await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(`👋 Welcome back, <@${userId}>! Your AFK status has been cleared.`)], ephemeral: true });
        } else {
          (afkUsers as Map<string, { status: string; since: number }>).set(userId, { status, since: Date.now() });
          await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(`✅ You're now AFK with status: **${status}**`)], ephemeral: true });
        }
        break;
      }

      // ── Utility ────────────────────────────────────────────────────────────
      case "nick": {
        if (!guild) { await interaction.reply({ content: "❌ Server only.", ephemeral: true }); return; }
        await interaction.deferReply({ ephemeral: true });
        const user = interaction.options.getUser("user", true);
        const name = interaction.options.getString("name", true);
        const member = guild.members.cache.get(user.id) ?? await guild.members.fetch(user.id).catch(() => null) as GuildMember | null;
        if (!member) { await interaction.editReply("❌ Member not found."); return; }
        const newNick = name.toLowerCase() === "reset" ? null : name;
        await member.setNickname(newNick, `Changed by ${interaction.user.tag}`);
        await interaction.editReply(newNick ? `✅ Nickname of **${user.username}** set to **${newNick}**.` : `✅ Nickname of **${user.username}** cleared.`);
        break;
      }
      case "roleicon": {
        if (!guild) { await interaction.reply({ content: "❌ Server only.", ephemeral: true }); return; }
        const execMember = guild.members.cache.get(interaction.user.id) ?? await guild.members.fetch(interaction.user.id).catch(() => null) as GuildMember | null;
        if (!execMember?.permissions.has(PermissionFlagsBits.ManageRoles)) {
          await interaction.reply({ content: "❌ You need **Manage Roles** permission.", ephemeral: true }); return;
        }
        const role = interaction.options.getRole("role", true);
        const rawEmoji = interaction.options.getString("emoji");
        await interaction.deferReply({ ephemeral: true });
        try {
          const guildRole = guild.roles.cache.get(role.id) ?? await guild.roles.fetch(role.id).catch(() => null);
          if (!guildRole) { await interaction.editReply("❌ Could not find that role."); return; }

          if (!rawEmoji) {
            // Remove icon
            await guildRole.edit({ unicodeEmoji: null });
            await guildRole.setIcon(null).catch(() => null);
            await interaction.editReply(`✅ Removed the icon from <@&${role.id}>.`);
          } else {
            // Custom emoji: <:name:id> or <a:name:id>
            const customMatch = rawEmoji.match(/^<(a)?:[^:]+:(\d+)>$/);
            if (customMatch) {
              const animated = customMatch[1] === "a";
              const emojiId = customMatch[2];
              const ext = animated ? "gif" : "png";
              const url = `https://cdn.discordapp.com/emojis/${emojiId}.${ext}`;
              await guildRole.setIcon(url);
              await interaction.editReply(`✅ Set the icon of <@&${role.id}> to ${rawEmoji}.`);
            } else {
              // Unicode emoji — strip variation selectors
              const unicodeEmoji = rawEmoji.replace(/[\uFE0E\uFE0F]/g, "").trim();
              await guildRole.edit({ unicodeEmoji });
              await interaction.editReply(`✅ Set the icon of <@&${role.id}> to **${unicodeEmoji}**.`);
            }
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          const code = (err as { code?: number | string })?.code;
          const isBoostError =
            code === 50074 || code === "50074" ||
            msg.includes("50074") ||
            msg.includes("FEATURE_REQUIRED") ||
            msg.includes("guild feature") ||
            msg.includes("boosted");
          if (code === 10014 || code === "10014" || msg.includes("10014")) {
            await interaction.editReply("❌ Invalid emoji. Use a standard Unicode emoji (e.g. 🔥 🎮 ⭐ 👑) or a custom server emoji.");
          } else if (isBoostError) {
            await interaction.editReply("❌ Role icons require **Server Boost Level 2** (this server needs at least 7 boosts).");
          } else {
            await interaction.editReply(`❌ Failed to update role icon. (Discord error: \`${code ?? msg}\`)\nMake sure my role is above the target role.`);
          }
        }
        break;
      }

      case "role": {
        if (!guild) { await interaction.reply({ content: "❌ Server only.", ephemeral: true }); return; }
        await interaction.deferReply({ ephemeral: true });
        const user = interaction.options.getUser("user", true);
        const role = interaction.options.getRole("role", true);
        const member = guild.members.cache.get(user.id) ?? await guild.members.fetch(user.id).catch(() => null) as GuildMember | null;
        if (!member) { await interaction.editReply("❌ Member not found."); return; }
        if (member.roles.cache.has(role.id)) {
          await member.roles.remove(role.id, `Toggled by ${interaction.user.tag}`);
          await interaction.editReply(`✅ Removed <@&${role.id}> from **${user.username}**.`);
        } else {
          await member.roles.add(role.id, `Toggled by ${interaction.user.tag}`);
          await interaction.editReply(`✅ Added <@&${role.id}> to **${user.username}**.`);
        }
        break;
      }
      case "color": {
        const hex = interaction.options.getString("hex", true).replace("#", "");
        if (!/^[0-9a-fA-F]{6}$/.test(hex)) { await interaction.reply({ content: "❌ Invalid hex color (e.g. `ff0000` or `#ff0000`).", ephemeral: true }); return; }
        const r = parseInt(hex.slice(0, 2), 16);
        const g2 = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        const int = parseInt(hex, 16);
        await interaction.reply({ embeds: [new EmbedBuilder().setColor(int).setTitle(`🎨 Color: #${hex.toUpperCase()}`).setDescription("‎").addFields({ name: "HEX", value: `\`#${hex.toUpperCase()}\``, inline: true }, { name: "RGB", value: `\`rgb(${r}, ${g2}, ${b})\``, inline: true }, { name: "Int", value: `\`${int}\``, inline: true })] });
        break;
      }
      case "banner": {
        if (!guild) { await interaction.reply({ content: "❌ Server only.", ephemeral: true }); return; }
        const user = interaction.options.getUser("user");
        if (user) {
          const fetched = await user.fetch().catch(() => null);
          const bannerUrl = fetched?.bannerURL({ size: 4096 });
          if (!bannerUrl) { await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(`❌ **${user.username}** has no banner.`)], ephemeral: true }); return; }
          await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setTitle(`🖼️ ${user.username}'s Banner`).setImage(bannerUrl).addFields({ name: "Download", value: `[Full size](${bannerUrl})` })] });
        } else {
          await guild.fetch();
          const serverBanner = guild.bannerURL({ size: 4096, extension: "png" });
          if (!serverBanner) { await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ This server has no banner.")], ephemeral: true }); return; }
          await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setTitle(`🖼️ ${guild.name} — Server Banner`).setImage(serverBanner).addFields({ name: "Download", value: `[Full size](${serverBanner})` })] });
        }
        break;
      }

      // ── Config: Welcome ────────────────────────────────────────────────────
      case "setwelcome": {
        if (!guild) { await interaction.reply({ content: "❌ Server only.", ephemeral: true }); return; }
        const sub = interaction.options.getSubcommand();
        if (sub === "disable") {
          await deleteWelcomeConfig(guild.id);
          await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("✅ Welcome messages **disabled**.")], ephemeral: true });
        } else if (sub === "channel") {
          const ch = interaction.options.getChannel("channel", true) as TextChannel;
          const existing = await getWelcomeConfig(guild.id);
          await upsertWelcomeConfig(guild.id, ch.id, existing?.message ?? "👋 Welcome to **{server}**, {user}! You are member **#{count}**.");
          await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(`✅ Welcome channel set to ${ch}!`)], ephemeral: true });
        } else if (sub === "message") {
          const text = interaction.options.getString("text", true);
          const existing = await getWelcomeConfig(guild.id);
          await upsertWelcomeConfig(guild.id, existing?.channelId ?? interaction.channelId, text);
          await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(`✅ Welcome message updated:\n\`\`\`${text}\`\`\``)], ephemeral: true });
        } else if (sub === "test") {
          const config = await getWelcomeConfig(guild.id);
          if (!config) { await interaction.reply({ content: "❌ Set a welcome channel first.", ephemeral: true }); return; }
          const member = guild.members.cache.get(interaction.user.id);
          if (member) await handleWelcomeMember(member);
          await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(`✅ Preview sent to <#${config.channelId}>.`)], ephemeral: true });
        }
        break;
      }

      // ── Config: Leave ──────────────────────────────────────────────────────
      case "setleave": {
        if (!guild) { await interaction.reply({ content: "❌ Server only.", ephemeral: true }); return; }
        const sub = interaction.options.getSubcommand();
        if (sub === "disable") {
          await deleteLeaveConfig(guild.id);
          await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("✅ Leave messages **disabled**.")], ephemeral: true });
        } else if (sub === "channel") {
          const ch = interaction.options.getChannel("channel", true) as TextChannel;
          const existing = await getLeaveConfig(guild.id);
          await upsertLeaveConfig(guild.id, ch.id, existing?.message ?? "👋 **{username}** has left **{server}**.");
          await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(`✅ Leave channel set to ${ch}!`)], ephemeral: true });
        } else if (sub === "message") {
          const text = interaction.options.getString("text", true);
          const existing = await getLeaveConfig(guild.id);
          await upsertLeaveConfig(guild.id, existing?.channelId ?? interaction.channelId, text);
          await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(`✅ Leave message updated:\n\`\`\`${text}\`\`\``)], ephemeral: true });
        } else if (sub === "test") {
          const config = await getLeaveConfig(guild.id);
          if (!config) { await interaction.reply({ content: "❌ Set a leave channel first.", ephemeral: true }); return; }
          const member = guild.members.cache.get(interaction.user.id);
          if (member) await handleLeaveMember(member);
          await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(`✅ Preview sent to <#${config.channelId}>.`)], ephemeral: true });
        }
        break;
      }

      // ── Config: No-prefix ──────────────────────────────────────────────────
      case "setprefix": {
        if (!guild) { await interaction.reply({ content: "❌ Server only.", ephemeral: true }); return; }
        const execMember = guild.members.cache.get(interaction.user.id) ?? await guild.members.fetch(interaction.user.id).catch(() => null) as GuildMember | null;
        if (!execMember?.permissions.has(PermissionFlagsBits.ManageGuild)) {
          await interaction.reply({ content: "❌ You need **Manage Server** permission.", ephemeral: true }); return;
        }
        const newPrefix = interaction.options.getString("prefix", true);
        await setPrefix(guild.id, newPrefix);
        await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x57f287).setDescription(`✅ Server prefix changed to \`${newPrefix}\`\nAll commands now use \`${newPrefix}help\`, \`${newPrefix}ban\`, etc.\n\nYou can always reset it back with \`/setprefix prefix:!\``)] , ephemeral: true });
        break;
      }

      case "noprefix": {
        if (!guild) { await interaction.reply({ content: "❌ Server only.", ephemeral: true }); return; }
        const sub = interaction.options.getSubcommand();
        if (sub === "set") {
          const role = interaction.options.getRole("role", true);
          await setNoPrefixRoleDb(guild.id, role.id);
          await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(`✅ No-prefix role set to <@&${role.id}>.\nMembers with this role can use commands without \`!\`.`)], ephemeral: true });
        } else if (sub === "remove") {
          await deleteNoPrefixRoleDb(guild.id);
          await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("✅ No-prefix role **removed**.")], ephemeral: true });
        } else if (sub === "status") {
          const roleId = getNoPrefixRole(guild.id);
          await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(roleId ? `⚡ No-prefix role: <@&${roleId}>` : "No no-prefix role set.")], ephemeral: true });
        }
        break;
      }

      // ── Config: Vanity role ────────────────────────────────────────────────
      case "vanityrole": {
        if (!guild) { await interaction.reply({ content: "❌ Server only.", ephemeral: true }); return; }
        const sub = interaction.options.getSubcommand();
        if (sub === "set") {
          const role = interaction.options.getRole("role", true);
          const existing = getVanityConfigFromCache(guild.id);
          await setVanityRoleDb(guild.id, { roleId: role.id, code: existing?.code });
          await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(`✅ Vanity role set to <@&${role.id}>.`)], ephemeral: true });
        } else if (sub === "url") {
          const code = interaction.options.getString("code", true).replace(/discord\.gg\//gi, "").replace(/discord\.com\/invite\//gi, "").trim();
          const existing = getVanityConfigFromCache(guild.id);
          await setVanityRoleDb(guild.id, { roleId: existing?.roleId ?? "", code });
          await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(`✅ Vanity code set to \`${code}\`.`)], ephemeral: true });
        } else if (sub === "disable") {
          await deleteVanityRoleDb(guild.id);
          await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("✅ Vanity role system **disabled**.")], ephemeral: true });
        } else if (sub === "check") {
          await interaction.deferReply({ ephemeral: true });
          const config = getVanityConfigFromCache(guild.id);
          if (!config?.roleId) { await interaction.editReply("❌ Set a role first with `/vanityrole set`."); return; }
          const code = config.code ?? guild.vanityURLCode;
          if (!code) { await interaction.editReply("❌ No vanity code. Set with `/vanityrole url`."); return; }
          const role = guild.roles.cache.get(config.roleId);
          if (!role) { await interaction.editReply("❌ Role not found."); return; }
          await guild.members.fetch();
          let added = 0, removed = 0;
          for (const [, member] of guild.members.cache) {
            if (member.user.bot) continue;
            const presence = member.presence;
            if (!presence) continue;
            const hasVanity = statusHasVanity(presence, code);
            const hasRole = member.roles.cache.has(role.id);
            if (hasVanity && !hasRole) { await member.roles.add(role).catch(() => {}); added++; }
            else if (!hasVanity && hasRole) { await member.roles.remove(role).catch(() => {}); removed++; }
          }
          await interaction.editReply(`✅ Scan complete! Added: **${added}**, Removed: **${removed}**.`);
        }
        break;
      }

      // ── Config: Triggers ───────────────────────────────────────────────────
      case "trigger": {
        if (!guild) { await interaction.reply({ content: "❌ Server only.", ephemeral: true }); return; }
        const sub = interaction.options.getSubcommand();
        if (sub === "add") {
          const type = interaction.options.getString("type", true) as "reply" | "react";
          const keyword = interaction.options.getString("keyword", true).toLowerCase();
          const value = interaction.options.getString("value", true);
          const exact = interaction.options.getBoolean("exact") ?? false;
          const list = getGuildTriggersFromCache(guild.id);
          if (list.length >= 25) { await interaction.reply({ content: "❌ Maximum 25 triggers per server.", ephemeral: true }); return; }
          const id = Math.random().toString(36).slice(2, 8).toUpperCase();
          await addTriggerEntry({ id, guildId: guild.id, keyword, type, value, exact });
          await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(`✅ Trigger added! ID: \`${id}\`\n**Type:** ${type.toUpperCase()}${exact ? " (exact)" : ""}\n**Keyword:** \`${keyword}\`\n**Value:** ${value}`)], ephemeral: true });
        } else if (sub === "list") {
          const list = getGuildTriggersFromCache(guild.id);
          if (list.length === 0) { await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("No triggers set up.")], ephemeral: true }); return; }
          const lines = list.map((t) => `\`${t.id}\` **${t.type.toUpperCase()}** ${t.exact ? "(exact) " : ""}\`${t.keyword}\` → ${t.value}`).join("\n");
          await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setTitle("⚡ Triggers").setDescription(lines)], ephemeral: true });
        } else if (sub === "remove") {
          const id = interaction.options.getString("id", true).toUpperCase();
          const found = await removeTriggerEntry(guild.id, id);
          await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(found ? `✅ Trigger \`${id}\` removed.` : `❌ No trigger with ID \`${id}\`.`)], ephemeral: true });
        } else if (sub === "clear") {
          await clearTriggerEntries(guild.id);
          await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("✅ All triggers cleared.")], ephemeral: true });
        }
        break;
      }

      // ── Config: Reaction Roles ─────────────────────────────────────────────
      case "rr": {
        if (!guild) { await interaction.reply({ content: "❌ Server only.", ephemeral: true }); return; }
        const sub = interaction.options.getSubcommand();
        if (sub === "add") {
          await interaction.deferReply({ ephemeral: true });
          const msgId = interaction.options.getString("messageid", true);
          const emojiRaw = interaction.options.getString("emoji", true);
          const role = interaction.options.getRole("role", true);
          const emoji = normalizeEmoji(emojiRaw);
          try {
            const ch = interaction.channel as TextChannel;
            const msg = await ch.messages.fetch(msgId);
            await msg.react(emojiRaw);
            await addRREntry({ guildId: guild.id, channelId: interaction.channelId, messageId: msgId, emoji, roleId: role.id });
            await interaction.editReply(`✅ Reaction role added: ${emojiRaw} → <@&${role.id}>.`);
          } catch { await interaction.editReply("❌ Could not find that message or use that emoji."); }
        } else if (sub === "remove") {
          const msgId = interaction.options.getString("messageid", true);
          const emoji = normalizeEmoji(interaction.options.getString("emoji", true));
          const found = await removeRREntry(msgId, emoji);
          await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(found ? "✅ Reaction role removed." : "❌ Not found.")], ephemeral: true });
        } else if (sub === "list") {
          const all = getAllRR(guild.id);
          if (all.length === 0) { await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("No reaction roles set up.")], ephemeral: true }); return; }
          const lines = all.map((rr) => `<#${rr.channelId}> \`${rr.messageId}\` ${rr.emoji} → <@&${rr.roleId}>`).join("\n");
          await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setTitle("🎭 Reaction Roles").setDescription(lines).setFooter({ text: `${all.length} entry/entries` })], ephemeral: true });
        } else if (sub === "clear") {
          const msgId = interaction.options.getString("messageid", true);
          const count = await clearRREntries(msgId);
          await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(`✅ Removed **${count}** reaction role(s) from message \`${msgId}\`.`)], ephemeral: true });
        }
        break;
      }

      // ── Config: Tickets ────────────────────────────────────────────────────
      case "ticket": {
        if (!guild) { await interaction.reply({ content: "❌ Server only.", ephemeral: true }); return; }
        const sub = interaction.options.getSubcommand();
        if (sub === "setup") {
          await interaction.deferReply({ ephemeral: true });
          const supportRole = interaction.options.getRole("supportrole");
          const existing = getTicketConfig(guild.id) ?? { panelChannelId: interaction.channelId, panelMessageId: "", categoryId: null, supportRoleId: null, logChannelId: null, count: 0 };
          if (supportRole) existing.supportRoleId = supportRole.id;
          const ch = interaction.channel as TextChannel;
          const panelMsg = await ch.send({
            embeds: [new EmbedBuilder().setColor(C).setTitle("🎫 Support Tickets").setDescription("Click the button below to open a support ticket.\n\nA private channel will be created just for you and our staff team.").setFooter({ text: "One ticket per user at a time." })],
            components: [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId("ticket_open").setLabel("Open Ticket").setEmoji("🎫").setStyle(ButtonStyle.Primary))],
          });
          existing.panelChannelId = interaction.channelId;
          existing.panelMessageId = panelMsg.id;
          await saveTicketConfigToDb(guild.id, existing);
          await interaction.editReply("✅ Ticket panel set up!");
        } else if (sub === "category") {
          const catId = interaction.options.getString("id", true);
          const cat = guild.channels.cache.get(catId) as CategoryChannel | undefined;
          if (!cat || cat.type !== ChannelType.GuildCategory) { await interaction.reply({ content: "❌ Category not found.", ephemeral: true }); return; }
          const existing = getTicketConfig(guild.id) ?? { panelChannelId: interaction.channelId, panelMessageId: "", categoryId: null, supportRoleId: null, logChannelId: null, count: 0 };
          existing.categoryId = catId;
          await saveTicketConfigToDb(guild.id, existing);
          await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(`✅ Tickets will be created under **${cat.name}**.`)], ephemeral: true });
        } else if (sub === "logs") {
          const logCh = interaction.options.getChannel("channel", true) as TextChannel;
          const existing = getTicketConfig(guild.id) ?? { panelChannelId: interaction.channelId, panelMessageId: "", categoryId: null, supportRoleId: null, logChannelId: null, count: 0 };
          existing.logChannelId = logCh.id;
          await saveTicketConfigToDb(guild.id, existing);
          await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(`✅ Transcripts will be saved to ${logCh}.`)], ephemeral: true });
        } else if (sub === "add") {
          if (!isOpenTicket(interaction.channelId)) { await interaction.reply({ content: "❌ This is not a ticket channel.", ephemeral: true }); return; }
          const user = interaction.options.getUser("user", true);
          await (interaction.channel as TextChannel).permissionOverwrites.edit(user.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true }, { reason: `Added by ${interaction.user.tag}` });
          await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(`✅ Added <@${user.id}> to this ticket.`)], ephemeral: true });
        } else if (sub === "remove") {
          if (!isOpenTicket(interaction.channelId)) { await interaction.reply({ content: "❌ This is not a ticket channel.", ephemeral: true }); return; }
          const user = interaction.options.getUser("user", true);
          await (interaction.channel as TextChannel).permissionOverwrites.delete(user.id, `Removed by ${interaction.user.tag}`);
          await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(`✅ Removed <@${user.id}> from this ticket.`)], ephemeral: true });
        } else if (sub === "close") {
          if (!isOpenTicket(interaction.channelId)) { await interaction.reply({ content: "❌ This is not a ticket channel.", ephemeral: true }); return; }
          await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("🔒 Closing ticket in 3 seconds...")], ephemeral: true });
          const ch = interaction.channel as TextChannel;
          const opener = getTicketOpener(ch.id);
          const config = getTicketConfig(guild.id);
          if (config?.logChannelId) {
            try {
              const logCh = (await guild.channels.fetch(config.logChannelId)) as TextChannel;
              const msgs = await ch.messages.fetch({ limit: 100 });
              const sorted = [...msgs.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
              const transcript = sorted.map((m) => `[${new Date(m.createdTimestamp).toISOString()}] ${m.author.tag}: ${m.content || "[attachment]"}`).join("\n");
              await logCh.send({
                embeds: [new EmbedBuilder().setColor(C).setTitle(`📋 Ticket: #${ch.name}`).addFields({ name: "Closed by", value: `<@${interaction.user.id}>`, inline: true }, { name: "Opened by", value: opener ? `<@${opener}>` : "Unknown", inline: true }).setTimestamp()],
                files: [{ attachment: Buffer.from(transcript, "utf-8"), name: `${ch.name}-transcript.txt` }],
              });
            } catch { /* log unavailable */ }
          }
          removeOpenTicket(ch.id);
          setTimeout(() => ch.delete().catch(() => {}), 3000);
        }
        break;
      }

      // ── Existing info commands ─────────────────────────────────────────────
      case "info": {
        const sub = interaction.options.getSubcommand();
        if (sub === "ping") {
          const sent = await interaction.reply({ content: "🏓 Pinging...", fetchReply: true });
          const latency = sent.createdTimestamp - interaction.createdTimestamp;
          await interaction.editReply({ content: "", embeds: [new EmbedBuilder().setColor(C).setTitle("🏓 Pong!").addFields({ name: "📨 Message Latency", value: `\`${latency}ms\``, inline: true }, { name: "💓 API Latency", value: `\`${client.ws.ping}ms\``, inline: true })] });
        } else if (sub === "bot") {
          const uptime = process.uptime();
          const h = Math.floor(uptime / 3600), m = Math.floor((uptime % 3600) / 60), s = Math.floor(uptime % 60);
          await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setTitle(`🤖 ${client.user?.username ?? "Bot"} Info`).setThumbnail(client.user?.displayAvatarURL({ size: 256 }) ?? null).addFields({ name: "Bot Tag", value: `\`${client.user?.tag}\``, inline: true }, { name: "Servers", value: `\`${client.guilds.cache.size}\``, inline: true }, { name: "Uptime", value: `\`${h}h ${m}m ${s}s\``, inline: true }, { name: "Ping", value: `\`${client.ws.ping}ms\``, inline: true }, { name: "Library", value: "`discord.js v14`", inline: true }, { name: "Node.js", value: `\`${process.version}\``, inline: true }).setTimestamp()] });
        } else if (sub === "members") {
          if (!guild) { await interaction.reply({ content: "❌ Server only.", ephemeral: true }); return; }
          await guild.members.fetch().catch(() => {});
          const total = guild.memberCount;
          const humans = guild.members.cache.filter((m) => !m.user.bot).size;
          const bots = guild.members.cache.filter((m) => m.user.bot).size;
          const online = guild.members.cache.filter((m) => ["online", "dnd", "idle"].includes(m.presence?.status ?? "")).size;
          await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setTitle(`👥 ${guild.name} — Members`).addFields({ name: "Total", value: `\`${total}\``, inline: true }, { name: "Humans", value: `\`${humans}\``, inline: true }, { name: "Bots", value: `\`${bots}\``, inline: true }, { name: "Online", value: `\`${online}\``, inline: true })] });
        }
        break;
      }

      case "help": {
        await handleHelpInteraction(interaction);
        break;
      }

      case "link": {
        await interaction.reply({
          embeds: [
            new EmbedBuilder().setColor(C)
              .setTitle("🔗 Invite Bot to Your Server")
              .setDescription("Click the button below or the link to add the bot to your server!")
              .addFields({ name: "Invite Link", value: "[Click here to invite!](https://discord.com/oauth2/authorize?client_id=1397872401299144744)" })
              .setFooter({ text: "Thanks for using the bot! 💞" }),
          ],
          components: [
            new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder()
                .setLabel("Invite Bot")
                .setEmoji("🤖")
                .setStyle(ButtonStyle.Link)
                .setURL("https://discord.com/oauth2/authorize?client_id=1397872401299144744"),
            ),
          ],
        });
        break;
      }
      case "coinflip":
        await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(`**Coin Flip:** ${Math.random() < 0.5 ? "🪙 Heads!" : "🪙 Tails!"}`)] });
        break;
      case "dice": {
        const sides = interaction.options.getInteger("sides") ?? 6;
        const roll = Math.floor(Math.random() * sides) + 1;
        await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(`🎲 You rolled a **d${sides}**: **${roll}**`)] });
        break;
      }
      case "8ball": {
        const q = interaction.options.getString("question", true);
        const ans = EIGHT_BALL[Math.floor(Math.random() * EIGHT_BALL.length)];
        await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setTitle("🎱 Magic 8-Ball").addFields({ name: "❓ Question", value: q }, { name: "💬 Answer", value: ans })] });
        break;
      }
      case "choose": {
        const opts = interaction.options.getString("options", true).split(/[,|]/).map((o) => o.trim()).filter(Boolean);
        if (opts.length < 2) { await interaction.reply({ content: "❌ Provide at least 2 options.", ephemeral: true }); return; }
        await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(`🎯 I choose: **${opts[Math.floor(Math.random() * opts.length)]}**`)] });
        break;
      }
      case "remind": {
        const dur = interaction.options.getString("duration", true);
        const note = interaction.options.getString("message", true);
        const ms = parseDur(dur);
        if (!ms || ms > 7 * 24 * 60 * 60 * 1000) { await interaction.reply({ content: "❌ Invalid duration. Use `30s`, `5m`, `2h`, `1d` (max 7d).", ephemeral: true }); return; }
        const endAt = Math.floor((Date.now() + ms) / 1000);
        await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(`✅ I'll remind you about **${note}** <t:${endAt}:R>.`)], ephemeral: true });
        setTimeout(async () => {
          try { await (interaction.channel as TextChannel).send({ content: `<@${interaction.user.id}>`, embeds: [new EmbedBuilder().setColor(C).setTitle("⏰ Reminder!").setDescription(note).setTimestamp()] }); } catch { /* gone */ }
        }, ms);
        break;
      }
      case "servericon": {
        if (!guild) { await interaction.reply({ content: "❌ Server only.", ephemeral: true }); return; }
        const icon = guild.iconURL({ size: 4096, extension: "png" });
        if (!icon) { await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ No server icon set.")], ephemeral: true }); return; }
        await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setTitle(`🖼️ ${guild.name} — Server Icon`).setImage(icon).addFields({ name: "Download", value: `[Full size PNG](${icon})` })] });
        break;
      }
      case "userinfo": {
        if (!guild) { await interaction.reply({ content: "❌ Server only.", ephemeral: true }); return; }
        const user = interaction.options.getUser("user") ?? interaction.user;
        const member = guild.members.cache.get(user.id) ?? await guild.members.fetch(user.id).catch(() => null);
        if (!member) { await interaction.reply({ content: "❌ Member not found.", ephemeral: true }); return; }
        const roles = member.roles.cache.filter((r) => r.id !== guild.id).map((r) => r.toString()).join(", ") || "None";
        await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setAuthor({ name: member.displayName, iconURL: member.user.displayAvatarURL() }).setThumbnail(member.user.displayAvatarURL({ size: 256 })).addFields({ name: "Username", value: `\`${member.user.tag}\``, inline: true }, { name: "ID", value: `\`${member.id}\``, inline: true }, { name: "Joined Server", value: `<t:${Math.floor((member.joinedTimestamp ?? 0) / 1000)}:R>`, inline: true }, { name: "Account Created", value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true }, { name: "Roles", value: roles.length > 1000 ? roles.slice(0, 1000) + "..." : roles }).setTimestamp()] });
        break;
      }
      case "serverinfo": {
        if (!guild) { await interaction.reply({ content: "❌ Server only.", ephemeral: true }); return; }
        await guild.fetch();
        await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setTitle(guild.name).setThumbnail(guild.iconURL() ?? null).addFields({ name: "Owner", value: `<@${guild.ownerId}>`, inline: true }, { name: "Members", value: `\`${guild.memberCount}\``, inline: true }, { name: "Channels", value: `\`${guild.channels.cache.size}\``, inline: true }, { name: "Roles", value: `\`${guild.roles.cache.size}\``, inline: true }, { name: "Boosts", value: `\`${guild.premiumSubscriptionCount ?? 0}\``, inline: true }, { name: "Created", value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`, inline: true }).setTimestamp()] });
        break;
      }
      case "avatar": {
        const user = interaction.options.getUser("user") ?? interaction.user;
        const url = user.displayAvatarURL({ size: 4096, extension: "png" });
        await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setTitle(`🖼️ ${user.username}'s Avatar`).setImage(url).addFields({ name: "Download", value: `[Full size](${url})` })] });
        break;
      }
      case "leaderboard":
      case "rank":
        await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(`💡 Use \`!${commandName}\` for the full interactive leaderboard with buttons.`)], ephemeral: true });
        break;

      case "hide": {
        if (!guild) { await interaction.reply({ content: "❌ Server only.", ephemeral: true }); return; }
        await interaction.deferReply({ ephemeral: true });
        const target = interaction.options.getMember("user") as GuildMember | null;
        if (!target) { await interaction.editReply("❌ Member not found."); return; }
        const unhide = interaction.options.getBoolean("unhide") ?? false;
        const ch = interaction.channel as TextChannel;
        if (unhide) {
          await ch.permissionOverwrites.delete(target.id);
          await interaction.editReply(`✅ **${target.displayName}** can see **#${ch.name}** again.`);
        } else {
          await ch.permissionOverwrites.edit(target.id, { ViewChannel: false }, { type: OverwriteType.Member });
          await interaction.editReply(`🙈 Hidden **#${ch.name}** from **${target.displayName}**.`);
        }
        break;
      }
      case "steal": {
        if (!guild) { await interaction.reply({ content: "❌ Server only.", ephemeral: true }); return; }
        await interaction.deferReply();
        const raw = interaction.options.getString("emoji", true);
        const m = /<(a?):(\w+):(\d+)>/.exec(raw);
        if (!m) { await interaction.editReply("❌ Provide a valid custom emoji — Unicode emojis can't be stolen."); return; }
        const [, animated, originalName, emojiId] = m;
        const name = interaction.options.getString("name") ?? originalName;
        const ext = animated === "a" ? "gif" : "png";
        const url = `https://cdn.discordapp.com/emojis/${emojiId}.${ext}`;
        try {
          const emoji = await guild.emojis.create({ attachment: url, name });
          await interaction.editReply({ embeds: [new EmbedBuilder().setColor(C).setDescription(`✅ Stolen! Added ${emoji} as \`${emoji.name}\` (ID: \`${emoji.id}\`).`)] });
        } catch (e: unknown) {
          await interaction.editReply(`❌ Failed: ${e instanceof Error ? e.message : String(e)}`);
        }
        break;
      }
      case "emoji": {
        const raw = interaction.options.getString("emoji", true);
        const m = /<(a?):(\w+):(\d+)>/.exec(raw);
        if (!m) { await interaction.reply({ content: "❌ Provide a custom emoji (not a Unicode one).", ephemeral: true }); return; }
        const [, animated, name, emojiId] = m;
        const ext = animated === "a" ? "gif" : "png";
        const url = `https://cdn.discordapp.com/emojis/${emojiId}.${ext}?size=256`;
        await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setTitle(`${animated === "a" ? "Animated " : ""}Emoji — :${name}:`).setThumbnail(url).addFields({ name: "Name", value: `\`:${name}:\``, inline: true }, { name: "ID", value: `\`${emojiId}\``, inline: true }, { name: "Animated", value: animated === "a" ? "Yes" : "No", inline: true }, { name: "URL", value: `[Download](${url})` })] });
        break;
      }

      // ── Social Reactions (grouped under /social) ────────────────────────────
      case "social": {
        const sub = interaction.options.getSubcommand();
        await interaction.deferReply();
        const NEKOS: Record<string, string> = {
          hug: "hug", kiss: "kiss", slap: "slap", pat: "pat", poke: "poke",
          cuddle: "cuddle", bite: "bite", bonk: "bonk", kill: "shoot",
          wave: "wave", cry: "cry", highfive: "handhold",
          boop: "boop", lick: "lick", nuzzle: "nuzzle", dance: "dance",
          stare: "stare", tickle: "tickle", wink: "wink", blush: "blush",
          yeet: "yeet", nom: "nom", throw: "yeet", smile: "smile", happy: "happy",
        };
        const PHRASES: Record<string, string[]> = {
          hug: ["gave a warm hug to", "hugged", "squeezed tightly", "wrapped their arms around"],
          kiss: ["kissed", "planted a kiss on", "smooched", "gave a sweet kiss to"],
          slap: ["slapped", "smacked", "SLAPPED", "yeeted a slap at"],
          pat: ["patted", "gave head pats to", "gently patted", "head-patted"],
          poke: ["poked", "booped", "gently poked", "👉 poked at"],
          cuddle: ["cuddled", "snuggled with", "cuddled up to", "held close"],
          bite: ["bit", "nibbled on", "chomped", "gently bit"],
          bonk: ["bonked 🔨", "BONKED", "gently bonked", "🔨 smacked"],
          kill: ["eliminated ☠️", "defeated", "destroyed", "utterly annihilated", "sent to the shadow realm"],
          wave: ["waved at", "waved hello to"],
          cry: ["is crying...", "broke down crying..."],
          highfive: ["high-fived", "gave a high five to", "✋ high-fived"],
          boop: ["booped on the nose", "👆 booped", "gave a little boop to"],
          lick: ["licked", "gave a lick to", "👅 licked"],
          nuzzle: ["nuzzled", "snuggled against", "🐾 nuzzled up to"],
          dance: ["is dancing! 💃", "busted out some moves! 🕺", "started dancing! 🎵"],
          stare: ["is staring at", "👀 can't stop staring at", "is intensely gazing at"],
          tickle: ["tickled", "🤭 tickled mercilessly", "went full tickle mode on"],
          wink: ["winked at", "😉 gave a cheeky wink to", "winked seductively at"],
          blush: ["is blushing... 😳", "turned red! 🫣", "is flushed 💕"],
          yeet: ["YEETED into the void! 🌀", "sent flying! ✈️", "launched at full speed! 🚀"],
          nom: ["nom nom nom'd on", "😋 started eating", "is having a snack: "],
          throw: ["threw something at", "🎯 launched a projectile at", "yoinked and tossed at"],
          smile: ["smiled at", "😊 gave a warm smile to", "flashed a big grin at"],
          happy: ["is super happy because of", "🎉 is jumping with joy for", "is over the moon for"],
        };
        const EMOJIS: Record<string, string> = {
          hug: "🤗", kiss: "💋", slap: "👋", pat: "✋", poke: "👉",
          cuddle: "🥰", bite: "😬", bonk: "🔨", kill: "☠️", wave: "👋",
          cry: "😢", highfive: "✋", boop: "👆", lick: "👅", nuzzle: "🐾",
          dance: "💃", stare: "👀", tickle: "🤭", wink: "😉", blush: "😳",
          yeet: "🌀", nom: "😋", throw: "🎯", smile: "😊", happy: "🎉",
        };
        const targetUser = interaction.options.getUser("user");
        const phrases = PHRASES[sub] ?? [sub];
        const phrase = phrases[Math.floor(Math.random() * phrases.length)]!;
        const emoji = EMOJIS[sub] ?? "";
        const nkEndpoint = NEKOS[sub] ?? sub;
        let gif: string | undefined;
        try {
          const res = await fetch(`https://nekos.best/api/v2/${nkEndpoint}`, { signal: AbortSignal.timeout(5000) });
          if (res.ok) {
            const data = await res.json() as { results?: Array<{ url: string }> };
            gif = data?.results?.[0]?.url;
          }
        } catch { /* ignore */ }
        const actor = interaction.user.username;
        const desc = targetUser
          ? `**${actor}** ${phrase} **${targetUser.username}** ${emoji}`
          : `**${actor}** ${phrase} ${emoji}`;
        const embed = new EmbedBuilder().setColor(C).setDescription(desc);
        if (gif) embed.setImage(gif);
        await interaction.editReply({ embeds: [embed] });
        break;
      }

      // ── Anti-Nuke ───────────────────────────────────────────────────────────
      case "antinuke": {
        if (!guild) { await interaction.reply({ content: "❌ Server only.", ephemeral: true }); return; }
        const execMember = guild.members.cache.get(interaction.user.id) ?? await guild.members.fetch(interaction.user.id).catch(() => null) as GuildMember | null;
        if (!execMember?.permissions.has(PermissionFlagsBits.Administrator)) {
          await interaction.reply({ content: "❌ You need **Administrator** permission.", ephemeral: true }); return;
        }
        const sub = interaction.options.getSubcommand();
        await interaction.deferReply({ ephemeral: true });
        const fakeMsg = {
          guild,
          author: { id: interaction.user.id, username: interaction.user.username, bot: false },
          content: sub === "whitelist"
            ? `!antinuke whitelist <@${interaction.options.getUser("user", true).id}>`
            : sub === "logs"
            ? `!antinuke logs <#${interaction.options.getChannel("channel", true).id}>`
            : sub === "threshold"
            ? `!antinuke threshold ${interaction.options.getString("action", true)} ${interaction.options.getInteger("count", true)}`
            : sub === "action"
            ? `!antinuke action ${interaction.options.getString("type", true)}`
            : `!antinuke ${sub}`,
          mentions: {
            users: { first: () => sub === "whitelist" ? interaction.options.getUser("user") : undefined },
            channels: { first: () => sub === "logs" ? interaction.options.getChannel("channel") : undefined },
            members: null,
          },
          reply: async (opts: unknown) => { await interaction.editReply(opts as Parameters<typeof interaction.editReply>[0]); return null as never; },
          channel: null,
          member: execMember,
        } as never;
        await handleAntiNuke(fakeMsg);
        break;
      }

      // ── AutoMod ─────────────────────────────────────────────────────────────
      case "automod": {
        if (!guild) { await interaction.reply({ content: "❌ Server only.", ephemeral: true }); return; }
        const sub = interaction.options.getSubcommand();
        let fakeContent = `!automod ${sub}`;
        if (sub === "invites" || sub === "links") fakeContent += ` ${interaction.options.getString("toggle", true)}`;
        if (sub === "spam") fakeContent += ` ${interaction.options.getInteger("count", true)}`;
        if (sub === "caps") {
          const pct = interaction.options.getInteger("percent", true);
          fakeContent += ` ${pct === 0 ? "off" : pct}`;
        }
        if (sub === "logs") fakeContent += ` <#${interaction.options.getChannel("channel", true).id}>`;
        await interaction.deferReply({ ephemeral: true });
        const fakeMsg = {
          guild,
          author: { id: interaction.user.id, username: interaction.user.username, bot: false },
          content: fakeContent,
          mentions: {
            users: { first: () => undefined },
            channels: { first: () => sub === "logs" ? interaction.options.getChannel("channel") : undefined },
            roles: { first: () => undefined },
            members: null,
          },
          reply: async (opts: any) => { await interaction.editReply(opts); return null as any; },
          channel: null,
          member: guild.members.cache.get(interaction.user.id),
        } as any;
        await handleAutoMod(fakeMsg);
        break;
      }

      // ── Setup ───────────────────────────────────────────────────────────────
      case "setup": {
        if (!guild) { await interaction.reply({ content: "❌ Server only.", ephemeral: true }); return; }
        const member = guild.members.cache.get(interaction.user.id);
        if (!member?.permissions.has(PermissionFlagsBits.Administrator)) {
          await interaction.reply({ content: "❌ You need **Administrator** permission.", ephemeral: true });
          return;
        }
        await interaction.reply({ content: "⚙️ Running server setup... Check the channel for progress!", ephemeral: true });
        const setupMsg = await (interaction.channel as TextChannel | null)?.send({
          embeds: [new EmbedBuilder().setColor(C).setDescription("⚙️ Setting up your server... Please wait.")]
        });
        if (!setupMsg) { await interaction.editReply("❌ Couldn't send setup message."); return; }
        const fakeMsg = {
          guild,
          author: { id: interaction.user.id, username: interaction.user.username, bot: false },
          content: "!setup",
          mentions: { users: null, channels: null, roles: null, members: null },
          reply: async (opts: any) => { await setupMsg.edit(opts); return setupMsg as any; },
          channel: interaction.channel,
          member,
        } as any;
        await handleSetup(fakeMsg);
        break;
      }

      // ── Extended Moderation ──────────────────────────────────────────────────
      case "softban": {
        if (!guild) { await interaction.reply({ content: "❌ Server only.", ephemeral: true }); return; }
        const execMember = guild.members.cache.get(interaction.user.id) ?? await guild.members.fetch(interaction.user.id).catch(() => null) as GuildMember | null;
        if (!execMember?.permissions.has(PermissionFlagsBits.BanMembers)) { await interaction.reply({ content: "❌ You need **Ban Members** permission.", ephemeral: true }); return; }
        await interaction.deferReply({ ephemeral: true });
        const user = interaction.options.getUser("user", true);
        const reason = interaction.options.getString("reason") ?? "No reason provided";
        const member = guild.members.cache.get(user.id) ?? await guild.members.fetch(user.id).catch(() => null) as GuildMember | null;
        if (!member) { await interaction.editReply("❌ Member not found."); return; }
        try {
          await guild.bans.create(member.id, { deleteMessageSeconds: 86400, reason: `[Softban] ${reason}` });
          await guild.bans.remove(member.id, "Softban - auto unban");
          await logCase(client, { type: "BAN", guildId: guild.id, targetId: member.id, targetTag: member.user.tag, moderatorId: interaction.user.id, reason: `[Softban] ${reason}` });
          await interaction.editReply(`✅ **${member.user.tag}** has been softbanned. Messages deleted, they may rejoin.`);
        } catch { await interaction.editReply("❌ Failed to softban. Check my permissions."); }
        break;
      }

      case "hackban": {
        if (!guild) { await interaction.reply({ content: "❌ Server only.", ephemeral: true }); return; }
        const execMember = guild.members.cache.get(interaction.user.id) ?? await guild.members.fetch(interaction.user.id).catch(() => null) as GuildMember | null;
        if (!execMember?.permissions.has(PermissionFlagsBits.BanMembers)) { await interaction.reply({ content: "❌ You need **Ban Members** permission.", ephemeral: true }); return; }
        await interaction.deferReply({ ephemeral: true });
        const userId = interaction.options.getString("userid", true).trim();
        const reason = interaction.options.getString("reason") ?? "No reason provided";
        if (!/^\d+$/.test(userId)) { await interaction.editReply("❌ Please provide a valid numeric user ID."); return; }
        try {
          const user = await client.users.fetch(userId);
          await guild.bans.create(userId, { reason: `[Hackban] ${reason}` });
          await logCase(client, { type: "BAN", guildId: guild.id, targetId: user.id, targetTag: user.tag, moderatorId: interaction.user.id, reason: `[Hackban] ${reason}` });
          await interaction.editReply(`✅ **${user.tag}** has been hackbanned (they were not in the server).`);
        } catch { await interaction.editReply("❌ Failed to ban. Check my permissions or verify the user ID."); }
        break;
      }

      case "vmute": {
        if (!guild) { await interaction.reply({ content: "❌ Server only.", ephemeral: true }); return; }
        const execMember = guild.members.cache.get(interaction.user.id) ?? await guild.members.fetch(interaction.user.id).catch(() => null) as GuildMember | null;
        if (!execMember?.permissions.has(PermissionFlagsBits.MuteMembers)) { await interaction.reply({ content: "❌ You need **Mute Members** permission.", ephemeral: true }); return; }
        await interaction.deferReply({ ephemeral: true });
        const user = interaction.options.getUser("user", true);
        const member = guild.members.cache.get(user.id) ?? await guild.members.fetch(user.id).catch(() => null) as GuildMember | null;
        if (!member) { await interaction.editReply("❌ Member not found."); return; }
        if (!member.voice.channel) { await interaction.editReply("❌ That member is not in a voice channel."); return; }
        try {
          await member.voice.setMute(true);
          await interaction.editReply(`🔇 Server-muted **${member.displayName}** in voice.`);
        } catch { await interaction.editReply("❌ Failed to mute."); }
        break;
      }

      case "vunmute": {
        if (!guild) { await interaction.reply({ content: "❌ Server only.", ephemeral: true }); return; }
        const execMember = guild.members.cache.get(interaction.user.id) ?? await guild.members.fetch(interaction.user.id).catch(() => null) as GuildMember | null;
        if (!execMember?.permissions.has(PermissionFlagsBits.MuteMembers)) { await interaction.reply({ content: "❌ You need **Mute Members** permission.", ephemeral: true }); return; }
        await interaction.deferReply({ ephemeral: true });
        const user = interaction.options.getUser("user", true);
        const member = guild.members.cache.get(user.id) ?? await guild.members.fetch(user.id).catch(() => null) as GuildMember | null;
        if (!member) { await interaction.editReply("❌ Member not found."); return; }
        try {
          await member.voice.setMute(false);
          await interaction.editReply(`🔊 Removed server-mute from **${member.displayName}**.`);
        } catch { await interaction.editReply("❌ Failed to unmute."); }
        break;
      }

      case "deafen": {
        if (!guild) { await interaction.reply({ content: "❌ Server only.", ephemeral: true }); return; }
        const execMember = guild.members.cache.get(interaction.user.id) ?? await guild.members.fetch(interaction.user.id).catch(() => null) as GuildMember | null;
        if (!execMember?.permissions.has(PermissionFlagsBits.DeafenMembers)) { await interaction.reply({ content: "❌ You need **Deafen Members** permission.", ephemeral: true }); return; }
        await interaction.deferReply({ ephemeral: true });
        const user = interaction.options.getUser("user", true);
        const member = guild.members.cache.get(user.id) ?? await guild.members.fetch(user.id).catch(() => null) as GuildMember | null;
        if (!member?.voice.channel) { await interaction.editReply("❌ Member not in voice or not found."); return; }
        try {
          await member.voice.setDeaf(true);
          await interaction.editReply(`🔕 Server-deafened **${member.displayName}**.`);
        } catch { await interaction.editReply("❌ Failed to deafen."); }
        break;
      }

      case "undeafen": {
        if (!guild) { await interaction.reply({ content: "❌ Server only.", ephemeral: true }); return; }
        const execMember = guild.members.cache.get(interaction.user.id) ?? await guild.members.fetch(interaction.user.id).catch(() => null) as GuildMember | null;
        if (!execMember?.permissions.has(PermissionFlagsBits.DeafenMembers)) { await interaction.reply({ content: "❌ You need **Deafen Members** permission.", ephemeral: true }); return; }
        await interaction.deferReply({ ephemeral: true });
        const user = interaction.options.getUser("user", true);
        const member = guild.members.cache.get(user.id) ?? await guild.members.fetch(user.id).catch(() => null) as GuildMember | null;
        if (!member) { await interaction.editReply("❌ Member not found."); return; }
        try {
          await member.voice.setDeaf(false);
          await interaction.editReply(`🔔 Removed server-deafen from **${member.displayName}**.`);
        } catch { await interaction.editReply("❌ Failed to undeafen."); }
        break;
      }

      case "move": {
        if (!guild) { await interaction.reply({ content: "❌ Server only.", ephemeral: true }); return; }
        const execMember = guild.members.cache.get(interaction.user.id) ?? await guild.members.fetch(interaction.user.id).catch(() => null) as GuildMember | null;
        if (!execMember?.permissions.has(PermissionFlagsBits.MoveMembers)) { await interaction.reply({ content: "❌ You need **Move Members** permission.", ephemeral: true }); return; }
        await interaction.deferReply({ ephemeral: true });
        const user = interaction.options.getUser("user", true);
        const vc = interaction.options.getChannel("channel", true);
        const member = guild.members.cache.get(user.id) ?? await guild.members.fetch(user.id).catch(() => null) as GuildMember | null;
        if (!member?.voice.channel) { await interaction.editReply("❌ Member not in voice or not found."); return; }
        try {
          await member.voice.setChannel(vc.id);
          await interaction.editReply(`✅ Moved **${member.displayName}** to **${vc.name}**.`);
        } catch { await interaction.editReply("❌ Failed to move."); }
        break;
      }

      case "voicekick": {
        if (!guild) { await interaction.reply({ content: "❌ Server only.", ephemeral: true }); return; }
        const execMember = guild.members.cache.get(interaction.user.id) ?? await guild.members.fetch(interaction.user.id).catch(() => null) as GuildMember | null;
        if (!execMember?.permissions.has(PermissionFlagsBits.MoveMembers)) { await interaction.reply({ content: "❌ You need **Move Members** permission.", ephemeral: true }); return; }
        await interaction.deferReply({ ephemeral: true });
        const user = interaction.options.getUser("user", true);
        const member = guild.members.cache.get(user.id) ?? await guild.members.fetch(user.id).catch(() => null) as GuildMember | null;
        if (!member?.voice.channel) { await interaction.editReply("❌ Member not in voice or not found."); return; }
        try {
          await member.voice.disconnect();
          await interaction.editReply(`✅ Disconnected **${member.displayName}** from voice.`);
        } catch { await interaction.editReply("❌ Failed to disconnect."); }
        break;
      }

      case "banlist": {
        if (!guild) { await interaction.reply({ content: "❌ Server only.", ephemeral: true }); return; }
        const execMember = guild.members.cache.get(interaction.user.id) ?? await guild.members.fetch(interaction.user.id).catch(() => null) as GuildMember | null;
        if (!execMember?.permissions.has(PermissionFlagsBits.BanMembers)) { await interaction.reply({ content: "❌ You need **Ban Members** permission.", ephemeral: true }); return; }
        await interaction.deferReply({ ephemeral: true });
        const bans = await guild.bans.fetch();
        if (bans.size === 0) { await interaction.editReply({ embeds: [new EmbedBuilder().setColor(C).setDescription("✅ No users are banned in this server.")] }); return; }
        const list = bans.first(20).map((b) => `• **${b.user.tag}** (\`${b.user.id}\`) — ${b.reason ?? "No reason"}`).join("\n");
        await interaction.editReply({ embeds: [new EmbedBuilder().setColor(C).setTitle(`🔨 Ban List — ${bans.size} ban${bans.size !== 1 ? "s" : ""}`).setDescription(list + (bans.size > 20 ? `\n\n*...and ${bans.size - 20} more*` : ""))] });
        break;
      }

      case "clearreactions": {
        if (!guild) { await interaction.reply({ content: "❌ Server only.", ephemeral: true }); return; }
        const execMember = guild.members.cache.get(interaction.user.id) ?? await guild.members.fetch(interaction.user.id).catch(() => null) as GuildMember | null;
        if (!execMember?.permissions.has(PermissionFlagsBits.ManageMessages)) { await interaction.reply({ content: "❌ You need **Manage Messages** permission.", ephemeral: true }); return; }
        if (!interaction.channel) { await interaction.reply({ content: "❌ Cannot use in this channel.", ephemeral: true }); return; }
        await interaction.deferReply({ ephemeral: true });
        const msgId = interaction.options.getString("messageid", true).trim();
        try {
          const msg = await (interaction.channel as TextChannel).messages.fetch(msgId);
          await msg.reactions.removeAll();
          await interaction.editReply("✅ All reactions removed from that message.");
        } catch { await interaction.editReply("❌ Could not find that message in this channel."); }
        break;
      }

      // ── Utility ────────────────────────────────────────────────────────────
      case "roleinfo": {
        if (!guild) { await interaction.reply({ content: "❌ Server only.", ephemeral: true }); return; }
        const roleOpt = interaction.options.getRole("role", true);
        const fullRole = guild.roles.cache.get(roleOpt.id);
        if (!fullRole) { await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Role not found.")], ephemeral: true }); return; }
        await guild.members.fetch().catch(() => {});
        const memberCount = guild.members.cache.filter((m) => m.roles.cache.has(fullRole.id)).size;
        const perms = fullRole.permissions.toArray().slice(0, 8).join(", ") || "None";
        await interaction.reply({
          embeds: [
            new EmbedBuilder().setColor(fullRole.color || C).setTitle(`🏷️ Role Info: ${fullRole.name}`)
              .addFields(
                { name: "ID", value: `\`${fullRole.id}\``, inline: true },
                { name: "Color", value: fullRole.hexColor, inline: true },
                { name: "Position", value: `${fullRole.position}`, inline: true },
                { name: "Members", value: `${memberCount}`, inline: true },
                { name: "Mentionable", value: fullRole.mentionable ? "Yes" : "No", inline: true },
                { name: "Hoisted", value: fullRole.hoist ? "Yes" : "No", inline: true },
                { name: "Managed", value: fullRole.managed ? "Yes" : "No", inline: true },
                { name: "Created", value: `<t:${Math.floor(fullRole.createdTimestamp / 1000)}:R>`, inline: true },
                { name: "Key Permissions", value: perms, inline: false },
              ),
          ],
        });
        break;
      }

      case "channelinfo": {
        if (!guild) { await interaction.reply({ content: "❌ Server only.", ephemeral: true }); return; }
        const chOpt = interaction.options.getChannel("channel") ?? interaction.channel;
        if (!chOpt) { await interaction.reply({ content: "❌ Channel not found.", ephemeral: true }); return; }
        const channel = guild.channels.cache.get(chOpt.id);
        if (!channel) { await interaction.reply({ content: "❌ Channel not found.", ephemeral: true }); return; }
        const ciFields: { name: string; value: string; inline: boolean }[] = [
          { name: "ID", value: `\`${channel.id}\``, inline: true },
          { name: "Type", value: channel.type.toString(), inline: true },
          { name: "Created", value: `<t:${Math.floor(channel.createdTimestamp! / 1000)}:R>`, inline: true },
          { name: "Position", value: `${"position" in channel ? channel.position : "N/A"}`, inline: true },
        ];
        if ("topic" in channel && channel.topic) ciFields.push({ name: "Topic", value: channel.topic, inline: false });
        if ("nsfw" in channel) ciFields.push({ name: "NSFW", value: channel.nsfw ? "Yes" : "No", inline: true });
        if ("rateLimitPerUser" in channel && channel.rateLimitPerUser) ciFields.push({ name: "Slowmode", value: `${channel.rateLimitPerUser}s`, inline: true });
        await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setTitle(`#️⃣ Channel Info: ${channel.name}`).addFields(ciFields)] });
        break;
      }

      case "inviteinfo": {
        await interaction.deferReply();
        const code = interaction.options.getString("code", true).replace(/https?:\/\/discord\.gg\//i, "").trim();
        try {
          const invite = await client.fetchInvite(code);
          await interaction.editReply({
            embeds: [
              new EmbedBuilder().setColor(C).setTitle(`🔗 Invite Info: ${code}`).setURL(`https://discord.gg/${code}`)
                .addFields(
                  { name: "Guild", value: invite.guild?.name ?? "N/A", inline: true },
                  { name: "Channel", value: invite.channel?.name ?? "N/A", inline: true },
                  { name: "Inviter", value: invite.inviter?.tag ?? "N/A", inline: true },
                  { name: "Uses", value: invite.uses !== null ? `${invite.uses}${invite.maxUses ? `/${invite.maxUses}` : ""}` : "N/A", inline: true },
                  { name: "Expires", value: invite.expiresAt ? `<t:${Math.floor(invite.expiresAt.getTime() / 1000)}:R>` : "Never", inline: true },
                  { name: "Temporary", value: invite.temporary ? "Yes" : "No", inline: true },
                ),
            ],
          });
        } catch { await interaction.editReply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Invite not found or expired.")] }); }
        break;
      }

      case "invites": {
        if (!guild) { await interaction.reply({ content: "❌ Server only.", ephemeral: true }); return; }
        await interaction.deferReply();
        const target = interaction.options.getUser("user") ?? interaction.user;
        try {
          const invites = await guild.invites.fetch();
          const userInvites = invites.filter((i) => i.inviter?.id === target.id);
          const total = userInvites.reduce((sum, i) => sum + (i.uses ?? 0), 0);
          await interaction.editReply({
            embeds: [new EmbedBuilder().setColor(C).setDescription(`📨 **${target.username}** has **${total}** invite${total !== 1 ? "s" : ""} (across ${userInvites.size} link${userInvites.size !== 1 ? "s" : ""}).`)],
          });
        } catch { await interaction.editReply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Failed to fetch invites.")] }); }
        break;
      }

      case "permissions": {
        if (!guild) { await interaction.reply({ content: "❌ Server only.", ephemeral: true }); return; }
        const targetUser = interaction.options.getUser("user") ?? interaction.user;
        const member = guild.members.cache.get(targetUser.id) ?? await guild.members.fetch(targetUser.id).catch(() => null) as GuildMember | null;
        if (!member) { await interaction.reply({ content: "❌ Member not found.", ephemeral: true }); return; }
        const perms = member.permissions.toArray();
        const granted = perms.map((p) => `✅ ${p.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}`);
        await interaction.reply({
          embeds: [new EmbedBuilder().setColor(C).setTitle(`🔐 Permissions: ${member.displayName}`).setDescription(granted.join("\n").slice(0, 2048) || "No permissions")],
        });
        break;
      }

      case "inrole": {
        if (!guild) { await interaction.reply({ content: "❌ Server only.", ephemeral: true }); return; }
        await interaction.deferReply();
        const roleOpt = interaction.options.getRole("role", true);
        await guild.members.fetch().catch(() => {});
        const members = guild.members.cache.filter((m) => m.roles.cache.has(roleOpt.id));
        if (members.size === 0) { await interaction.editReply({ embeds: [new EmbedBuilder().setColor(C).setDescription(`No members have the **${roleOpt.name}** role.`)] }); return; }
        const list = members.first(30).map((m) => m.user.tag).join(", ");
        await interaction.editReply({ embeds: [new EmbedBuilder().setColor(C).setTitle(`👥 Members with role: ${roleOpt.name} (${members.size})`).setDescription(list + (members.size > 30 ? `\n*...and ${members.size - 30} more*` : ""))] });
        break;
      }

      case "boosters": {
        if (!guild) { await interaction.reply({ content: "❌ Server only.", ephemeral: true }); return; }
        await interaction.deferReply();
        await guild.members.fetch().catch(() => {});
        const boosters = guild.members.cache.filter((m) => !!m.premiumSince);
        if (boosters.size === 0) { await interaction.editReply({ embeds: [new EmbedBuilder().setColor(C).setDescription("💜 No boosters yet.")] }); return; }
        const list = boosters.map((m) => `${m.user.tag} — <t:${Math.floor(m.premiumSince!.getTime() / 1000)}:R>`).join("\n");
        await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x9b59b6).setTitle(`💜 Server Boosters — ${boosters.size}`).setDescription(list.slice(0, 2048))] });
        break;
      }

      case "firstmsg": {
        if (!guild) { await interaction.reply({ content: "❌ Server only.", ephemeral: true }); return; }
        await interaction.deferReply();
        const chOpt = interaction.options.getChannel("channel") ?? interaction.channel;
        if (!chOpt) { await interaction.editReply("❌ Channel not found."); return; }
        try {
          const messages = await (chOpt as TextChannel).messages.fetch({ limit: 1, after: "0" });
          const first = messages.first();
          if (!first) { await interaction.editReply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ No messages found.")] }); return; }
          await interaction.editReply({
            embeds: [
              new EmbedBuilder().setColor(C).setTitle("📜 First Message")
                .setDescription(`[Jump to message](${first.url})\n\n${first.content || "(No text content)"}`)
                .setFooter({ text: `Sent by ${first.author.tag}` })
                .setTimestamp(first.createdAt),
            ],
          });
        } catch { await interaction.editReply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Failed to fetch messages.")] }); }
        break;
      }

      // ── Config ─────────────────────────────────────────────────────────────
      case "autorole": {
        if (!guild) { await interaction.reply({ content: "❌ Server only.", ephemeral: true }); return; }
        const execMember = guild.members.cache.get(interaction.user.id) ?? await guild.members.fetch(interaction.user.id).catch(() => null) as GuildMember | null;
        if (!execMember?.permissions.has(PermissionFlagsBits.ManageGuild)) { await interaction.reply({ content: "❌ You need **Manage Server** permission.", ephemeral: true }); return; }
        await interaction.deferReply({ ephemeral: true });
        const sub = interaction.options.getSubcommand();
        const role = sub !== "list" ? interaction.options.getRole("role") : null;
        const fakeMsg = {
          guild, member: execMember,
          author: { id: interaction.user.id, username: interaction.user.username, bot: false },
          content: role ? `!autorole ${sub} <@&${role.id}>` : `!autorole ${sub}`,
          mentions: { roles: { first: () => role ? guild.roles.cache.get(role.id) : undefined }, users: { first: () => undefined }, channels: { first: () => undefined }, members: null },
          reply: async (opts: any) => { await interaction.editReply(opts); return null as any; },
          channel: interaction.channel, channelId: interaction.channelId,
        } as any;
        await handleAutoRole(fakeMsg);
        break;
      }

      case "sticky": {
        if (!guild) { await interaction.reply({ content: "❌ Server only.", ephemeral: true }); return; }
        const execMember = guild.members.cache.get(interaction.user.id) ?? await guild.members.fetch(interaction.user.id).catch(() => null) as GuildMember | null;
        if (!execMember?.permissions.has(PermissionFlagsBits.ManageMessages)) { await interaction.reply({ content: "❌ You need **Manage Messages** permission.", ephemeral: true }); return; }
        await interaction.deferReply({ ephemeral: true });
        const sub = interaction.options.getSubcommand();
        const stickyContent = sub === "set" ? interaction.options.getString("message", true) : "";
        const fakeMsg = {
          guild, member: execMember,
          author: { id: interaction.user.id, username: interaction.user.username, bot: false },
          content: `!sticky ${sub}${stickyContent ? ` ${stickyContent}` : ""}`,
          mentions: { roles: { first: () => undefined }, users: { first: () => undefined }, channels: { first: () => undefined }, members: null },
          reply: async (opts: any) => { await interaction.editReply(opts); return null as any; },
          channel: interaction.channel, channelId: interaction.channelId,
        } as any;
        await handleSticky(fakeMsg);
        break;
      }

      case "autoreact": {
        if (!guild) { await interaction.reply({ content: "❌ Server only.", ephemeral: true }); return; }
        const execMember = guild.members.cache.get(interaction.user.id) ?? await guild.members.fetch(interaction.user.id).catch(() => null) as GuildMember | null;
        if (!execMember?.permissions.has(PermissionFlagsBits.ManageGuild)) { await interaction.reply({ content: "❌ You need **Manage Server** permission.", ephemeral: true }); return; }
        await interaction.deferReply({ ephemeral: true });
        const sub = interaction.options.getSubcommand();
        const reactChannel = interaction.options.getChannel("channel");
        const emoji = interaction.options.getString("emoji");
        const fakeMsg = {
          guild, member: execMember,
          author: { id: interaction.user.id, username: interaction.user.username, bot: false },
          content: reactChannel
            ? `!autoreact ${sub} <#${reactChannel.id}>${emoji ? ` ${emoji}` : ""}`
            : `!autoreact ${sub}${emoji ? ` ${emoji}` : ""}`,
          mentions: {
            channels: { first: () => reactChannel ? guild.channels.cache.get(reactChannel.id) : undefined },
            roles: { first: () => undefined }, users: { first: () => undefined }, members: null,
          },
          reply: async (opts: any) => { await interaction.editReply(opts); return null as any; },
          channel: interaction.channel, channelId: interaction.channelId,
        } as any;
        await handleAutoReact(fakeMsg);
        break;
      }

      // ── Fun (grouped under /fun) ─────────────────────────────────────────────
      case "fun": {
        const sub = interaction.options.getSubcommand();
        if (sub === "joke") {
          await interaction.deferReply();
          try {
            const res = await fetch("https://official-joke-api.appspot.com/random_joke", { signal: AbortSignal.timeout(5000) });
            if (!res.ok) throw new Error();
            const data = await res.json() as { setup?: string; punchline?: string };
            if (!data.setup) throw new Error();
            await interaction.editReply({ embeds: [new EmbedBuilder().setColor(C).setTitle("😂 Random Joke").addFields({ name: "Setup", value: data.setup }, { name: "Punchline", value: `||${data.punchline}||` }).setFooter({ text: "Click the spoiler to reveal!" })] });
          } catch { await interaction.editReply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Couldn't fetch a joke. Try again!")] }); }
        } else if (sub === "dadjoke") {
          await interaction.deferReply();
          try {
            const res = await fetch("https://icanhazdadjoke.com/", { headers: { Accept: "application/json", "User-Agent": "DiscordBot" }, signal: AbortSignal.timeout(5000) });
            if (!res.ok) throw new Error();
            const data = await res.json() as { joke?: string };
            if (!data.joke) throw new Error();
            await interaction.editReply({ embeds: [new EmbedBuilder().setColor(C).setTitle("👨 Dad Joke").setDescription(`*${data.joke}*`)] });
          } catch { await interaction.editReply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Couldn't fetch a dad joke. Try again!")] }); }
        } else if (sub === "fact") {
          const FACTS_S = ["A group of flamingos is called a flamboyance.","Honey never spoils — archaeologists found 3,000-year-old honey in Egyptian tombs.","Octopuses have three hearts and blue blood.","A day on Venus is longer than a year on Venus.","Bananas are slightly radioactive due to potassium-40.","The shortest war in history lasted 38–45 minutes (Anglo-Zanzibar War, 1896).","Crows can recognize human faces and hold grudges.","The Eiffel Tower can be 15 cm taller in summer due to thermal expansion.","There are more possible chess games than atoms in the observable universe.","Wombats produce cube-shaped droppings — unique in the animal kingdom.","A group of owls is called a parliament.","Butterflies taste with their feet.","Sharks are older than trees — they've existed for over 400 million years.","The human body contains enough iron to make a 3-inch nail.","Cleopatra lived closer in time to the Moon landing than to the Great Pyramid's construction.","A snail can sleep for 3 years at a stretch.","Elephants are the only mammals that can't jump.","The dot over the letter 'i' is called a tittle.","Peanuts aren't technically nuts — they're legumes.","The tongue of a blue whale weighs as much as an elephant.","Lightning strikes Earth about 100 times per second.","Sea otters hold hands while sleeping so they don't drift apart.","The unicorn is Scotland's national animal.","It takes a photon around 8 minutes to travel from the Sun to Earth.","Cats have been domesticated for about 10,000 years."];
          await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setTitle("💡 Random Fact").setDescription(FACTS_S[Math.floor(Math.random() * FACTS_S.length)]!)] });
        } else if (sub === "quote") {
          const QUOTES_S = [{ q: "The only way to do great work is to love what you do.", a: "Steve Jobs" },{ q: "In the middle of every difficulty lies opportunity.", a: "Albert Einstein" },{ q: "It always seems impossible until it's done.", a: "Nelson Mandela" },{ q: "The future belongs to those who believe in the beauty of their dreams.", a: "Eleanor Roosevelt" },{ q: "Success is not final, failure is not fatal: It is the courage to continue that counts.", a: "Winston Churchill" },{ q: "Believe you can and you're halfway there.", a: "Theodore Roosevelt" },{ q: "Be the change that you wish to see in the world.", a: "Mahatma Gandhi" },{ q: "You only live once, but if you do it right, once is enough.", a: "Mae West" },{ q: "Life is what happens when you're busy making other plans.", a: "John Lennon" },{ q: "The way to get started is to quit talking and begin doing.", a: "Walt Disney" }];
          const q = QUOTES_S[Math.floor(Math.random() * QUOTES_S.length)]!;
          await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setTitle("💬 Inspirational Quote").setDescription(`*"${q.q}"*`).setFooter({ text: `— ${q.a}` })] });
        } else if (sub === "topic") {
          const TOPICS_S = ["What's one thing you'd change about the internet?","If you could have dinner with any historical figure, who would it be?","What's your unpopular opinion about a popular movie?","If you could live in any time period, when would it be?","What's the most useless skill you have?","If animals could talk, which would be the rudest?","What's the weirdest food combination you actually enjoy?","If you could instantly master one skill, what would it be?","What would you do if you woke up invisible for a day?","What's a technology you think will exist in 50 years?","Would you rather explore the deep ocean or outer space?","What's the best purchase you've ever made under $20?","If you could speak every language fluently, what's the first thing you'd do?","What show/movie are you embarrassed to admit you love?","What would your autobiography be titled?"];
          await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setTitle("💬 Conversation Topic").setDescription(TOPICS_S[Math.floor(Math.random() * TOPICS_S.length)]!)] });
        } else if (sub === "roast") {
          const ROASTS_S = ["You're not stupid — you just have bad luck thinking.","I'd agree with you, but then we'd both be wrong.","You have something on your chin... no, the third one down.","I've seen better arguments in a fortune cookie.","You're the reason the gene pool needs a lifeguard.","If brains were dynamite, you wouldn't have enough to blow your hat off.","You're proof that even evolution makes mistakes sometimes.","You have the right to remain silent. Please use it.","Your birth certificate is an apology letter from the maternity ward.","You're not the dumbest person alive, but you better hope they don't die."];
          const targetUser = interaction.options.getUser("user");
          const name = targetUser?.username ?? interaction.user.username;
          await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setTitle(`🔥 Roast: ${name}`).setDescription(ROASTS_S[Math.floor(Math.random() * ROASTS_S.length)]!)] });
        } else if (sub === "compliment") {
          const COMPLIMENTS_S = ["You light up every room you walk into! 🌟","Your smile could melt the coldest of hearts! 😊","You have a genuinely great sense of humor! 😂","You make the world a better place just by being in it! 🌍","Your kindness is truly one of a kind! 💖","You are more talented than you give yourself credit for! 🎯","Your positive attitude is absolutely contagious! ✨","You inspire everyone around you without even realizing it! 🙌","You have an amazing ability to make people feel welcome! 🤗","The world is genuinely lucky to have you in it! 🍀"];
          const targetUser = interaction.options.getUser("user");
          const name = targetUser?.username ?? interaction.user.username;
          await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setTitle(`💝 Compliment for ${name}`).setDescription(COMPLIMENTS_S[Math.floor(Math.random() * COMPLIMENTS_S.length)]!)] });
        } else if (sub === "ship") {
          const u1 = interaction.options.getUser("user1", true);
          const u2 = interaction.options.getUser("user2", true);
          const seed = (u1.id + u2.id).split("").reduce((s, c) => s + c.charCodeAt(0), 0);
          const score = ((seed * 1234567) % 101 + 101) % 101;
          const bar = "█".repeat(Math.floor(score / 10)) + "░".repeat(10 - Math.floor(score / 10));
          const shipEmoji = score >= 80 ? "💞" : score >= 60 ? "💕" : score >= 40 ? "💛" : score >= 20 ? "🤔" : "💔";
          await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setTitle(`${shipEmoji} Ship Meter`).setDescription(`**${u1.username}** 💘 **${u2.username}**\n\n\`[${bar}] ${score}%\``).setFooter({ text: score >= 80 ? "Perfect match! 💕" : score >= 60 ? "Pretty good!" : score >= 40 ? "Meh..." : score >= 20 ? "Not great..." : "Maybe just friends 😅" })] });
        } else if (sub === "rate") {
          const thing = interaction.options.getString("thing", true);
          const rateSeed = thing.split("").reduce((s, c) => s + c.charCodeAt(0), 0);
          const rateScore = ((rateSeed * 7919) % 11 + 11) % 11;
          const rateBar = "⭐".repeat(rateScore) + "☆".repeat(10 - rateScore);
          await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setTitle("⭐ Rating").setDescription(`**${thing}** — \`${rateBar}\` **${rateScore}/10**`)] });
        }
        break;
      }

      // ── Text Transform (grouped under /textify) ──────────────────────────────
      case "textify": {
        const sub = interaction.options.getSubcommand();
        if (sub === "reverse") {
          const text = interaction.options.getString("text", true);
          await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setTitle("🔄 Reversed").setDescription([...text].reverse().join(""))] });
        } else if (sub === "mock") {
          const text = interaction.options.getString("text", true);
          await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setTitle("🐸 Mocking").setDescription(text.split("").map((c, i) => i % 2 === 0 ? c.toLowerCase() : c.toUpperCase()).join(""))] });
        } else if (sub === "clap") {
          const text = interaction.options.getString("text", true);
          await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(text.split(" ").join(" 👏 "))] });
        } else if (sub === "upper") {
          await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(interaction.options.getString("text", true).toUpperCase())] });
        } else if (sub === "lower") {
          await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(interaction.options.getString("text", true).toLowerCase())] });
        } else if (sub === "emojify") {
          const text = interaction.options.getString("text", true);
          const emojified = text.toLowerCase().split("").map((c) => { if (c >= "a" && c <= "z") return `:regional_indicator_${c}: `; if (c === " ") return "   "; return c; }).join("");
          await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(emojified.slice(0, 2000))] });
        } else if (sub === "binary") {
          const text = interaction.options.getString("text", true);
          const bin = text.split("").map((c) => c.charCodeAt(0).toString(2).padStart(8, "0")).join(" ");
          await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setTitle("01 Binary").setDescription(`\`\`\`${bin.slice(0, 1990)}\`\`\``)] });
        } else if (sub === "morse") {
          const MORSE_MAP: Record<string, string> = { a:".-",b:"-...",c:"-.-.",d:"-..",e:".",f:"..-.",g:"--.",h:"....",i:"..",j:".---",k:"-.-",l:".-..",m:"--",n:"-.",o:"---",p:".--.",q:"--.-",r:".-.",s:"...",t:"-",u:"..-",v:"...-",w:".--",x:"-..-",y:"-.--",z:"--..", "0":"-----","1":".----","2":"..---","3":"...--","4":"....-","5":".....","6":"-....","7":"--...","8":"---..","9":"----."," ":"/" };
          const text = interaction.options.getString("text", true);
          await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setTitle("📡 Morse Code").setDescription(`\`${text.toLowerCase().split("").map((c) => MORSE_MAP[c] ?? "?").join(" ").slice(0, 1990)}\``)] });
        } else if (sub === "base64") {
          const mode = interaction.options.getString("mode", true);
          const text = interaction.options.getString("text", true);
          try {
            const result = mode === "encode" ? Buffer.from(text, "utf8").toString("base64") : Buffer.from(text, "base64").toString("utf8");
            await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setTitle(`🔐 Base64 ${mode}`).setDescription(`\`\`\`${result.slice(0, 1990)}\`\`\``)] });
          } catch { await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Failed to decode. Make sure the input is valid base64.")], ephemeral: true }); }
        } else if (sub === "length") {
          const text = interaction.options.getString("text", true);
          await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setTitle("📏 Text Stats").addFields({ name: "Characters", value: `\`${text.length}\``, inline: true }, { name: "Words", value: `\`${text.trim().split(/\s+/).length}\``, inline: true }, { name: "Lines", value: `\`${text.split("\n").length}\``, inline: true })] });
        }
        break;
      }

      // ── Generate (grouped under /gen) ────────────────────────────────────────
      case "gen": {
        const sub = interaction.options.getSubcommand();
        if (sub === "password") {
          const len = interaction.options.getInteger("length") ?? 16;
          const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=[]{}";
          const password = Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
          await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setTitle("🔑 Generated Password").setDescription(`\`${password}\``)], ephemeral: true });
        } else if (sub === "number") {
          const rMin = interaction.options.getInteger("min") ?? 1;
          const rMax = interaction.options.getInteger("max") ?? 100;
          if (rMin > rMax) { await interaction.reply({ content: "❌ Min must be less than or equal to max.", ephemeral: true }); return; }
          const num = Math.floor(Math.random() * (rMax - rMin + 1)) + rMin;
          await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(`🎲 Random number between **${rMin}** and **${rMax}**: **${num}**`)] });
        } else if (sub === "percent") {
          await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(`🎯 **${Math.floor(Math.random() * 101)}%**`)] });
        } else if (sub === "yesno") {
          await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(Math.random() < 0.5 ? "✅ **Yes!**" : "❌ **No!**")] });
        }
        break;
      }

      // ── Lookup (grouped under /lookup) ───────────────────────────────────────
      case "lookup": {
        const sub = interaction.options.getSubcommand();
        await interaction.deferReply();
        if (sub === "urban") {
          const term = interaction.options.getString("term", true);
          try {
            const res = await fetch(`https://api.urbandictionary.com/v0/define?term=${encodeURIComponent(term)}`, { signal: AbortSignal.timeout(5000) });
            if (!res.ok) throw new Error();
            const data = await res.json() as { list?: Array<{ word: string; definition: string; example: string; thumbs_up: number; thumbs_down: number; permalink: string }> };
            const entry = data?.list?.[0];
            if (!entry) throw new Error("no entry");
            const def = entry.definition.replace(/\[([^\]]+)\]/g, "$1").slice(0, 1024);
            const ex = entry.example.replace(/\[([^\]]+)\]/g, "$1").slice(0, 512);
            await interaction.editReply({ embeds: [new EmbedBuilder().setColor(C).setTitle(`📖 Urban Dictionary: ${entry.word}`).setURL(entry.permalink).addFields({ name: "Definition", value: def || "No definition" }, { name: "Example", value: ex ? `*${ex}*` : "None" }, { name: "👍", value: `${entry.thumbs_up}`, inline: true }, { name: "👎", value: `${entry.thumbs_down}`, inline: true })] });
          } catch { await interaction.editReply({ embeds: [new EmbedBuilder().setColor(C).setDescription(`❌ No definition found for **${interaction.options.getString("term", true)}**.`)] }); }
        } else if (sub === "wiki") {
          const query = interaction.options.getString("topic", true);
          try {
            const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`, { signal: AbortSignal.timeout(5000) });
            if (!res.ok) throw new Error();
            const data = await res.json() as { title?: string; extract?: string; thumbnail?: { source: string }; content_urls?: { desktop?: { page?: string } } };
            if (!data.extract) throw new Error();
            await interaction.editReply({ embeds: [new EmbedBuilder().setColor(C).setTitle(`📚 ${data.title}`).setDescription(data.extract.slice(0, 2048)).setThumbnail(data.thumbnail?.source ?? null).setURL(data.content_urls?.desktop?.page ?? "https://wikipedia.org").setFooter({ text: "Source: Wikipedia" })] });
          } catch { await interaction.editReply({ embeds: [new EmbedBuilder().setColor(C).setDescription(`❌ No Wikipedia article found for **${interaction.options.getString("topic", true)}**.`)] }); }
        }
        break;
      }

      // ── Convert (grouped under /convert) ─────────────────────────────────────
      case "convert": {
        const sub = interaction.options.getSubcommand();
        if (sub === "temp") {
          const val = interaction.options.getNumber("value", true);
          const unit = interaction.options.getString("unit", true);
          let tempResult = "";
          if (unit === "c") tempResult = `**${val}°C** = **${(val * 9 / 5 + 32).toFixed(2)}°F** = **${(val + 273.15).toFixed(2)}K**`;
          else if (unit === "f") tempResult = `**${val}°F** = **${((val - 32) * 5 / 9).toFixed(2)}°C** = **${((val - 32) * 5 / 9 + 273.15).toFixed(2)}K**`;
          else tempResult = `**${val}K** = **${(val - 273.15).toFixed(2)}°C** = **${((val - 273.15) * 9 / 5 + 32).toFixed(2)}°F**`;
          await interaction.reply({ embeds: [new EmbedBuilder().setColor(C).setTitle("🌡️ Temperature Conversion").setDescription(tempResult)] });
        }
        break;
      }

      // ── Animals (grouped under /animal) ──────────────────────────────────────
      case "animal": {
        const sub = interaction.options.getSubcommand();
        await interaction.deferReply();
        if (sub === "cat") {
          try {
            const res = await fetch("https://api.thecatapi.com/v1/images/search", { signal: AbortSignal.timeout(5000) });
            const data = await res.json() as Array<{ url?: string }>;
            if (!data[0]?.url) throw new Error();
            await interaction.editReply({ embeds: [new EmbedBuilder().setColor(C).setTitle("🐱 Random Cat").setImage(data[0].url)] });
          } catch { await interaction.editReply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Couldn't fetch a cat. Try again!")] }); }
        } else if (sub === "dog") {
          try {
            const res = await fetch("https://dog.ceo/api/breeds/image/random", { signal: AbortSignal.timeout(5000) });
            const data = await res.json() as { message?: string };
            if (!data.message) throw new Error();
            await interaction.editReply({ embeds: [new EmbedBuilder().setColor(C).setTitle("🐶 Random Dog").setImage(data.message)] });
          } catch { await interaction.editReply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Couldn't fetch a dog. Try again!")] }); }
        } else if (sub === "fox") {
          try {
            const res = await fetch("https://randomfox.ca/floof/", { signal: AbortSignal.timeout(5000) });
            const data = await res.json() as { image?: string };
            if (!data.image) throw new Error();
            await interaction.editReply({ embeds: [new EmbedBuilder().setColor(C).setTitle("🦊 Random Fox").setImage(data.image)] });
          } catch { await interaction.editReply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Couldn't fetch a fox. Try again!")] }); }
        } else if (sub === "duck") {
          try {
            const res = await fetch("https://random-d.uk/api/random", { signal: AbortSignal.timeout(5000) });
            const data = await res.json() as { url?: string };
            if (!data.url) throw new Error();
            await interaction.editReply({ embeds: [new EmbedBuilder().setColor(C).setTitle("🦆 Random Duck").setImage(data.url)] });
          } catch { await interaction.editReply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Couldn't fetch a duck. Try again!")] }); }
        }
        break;
      }

      // ── Games ───────────────────────────────────────────────────────────────
      case "rps": {
        const userMove = interaction.options.getString("choice", true);
        const moves = ["rock", "paper", "scissors"];
        const rpsEmojis: Record<string, string> = { rock: "🪨", paper: "📄", scissors: "✂️" };
        const botMove = moves[Math.floor(Math.random() * 3)]!;
        let rpsResult: string;
        if (userMove === botMove) rpsResult = "🤝 **It's a tie!**";
        else if ((userMove === "rock" && botMove === "scissors") || (userMove === "paper" && botMove === "rock") || (userMove === "scissors" && botMove === "paper"))
          rpsResult = "🎉 **You win!**";
        else rpsResult = "💀 **You lose!**";
        await interaction.reply({
          embeds: [
            new EmbedBuilder().setColor(C).setTitle("✂️ Rock Paper Scissors")
              .addFields(
                { name: "You", value: `${rpsEmojis[userMove]} ${userMove}`, inline: true },
                { name: "Bot", value: `${rpsEmojis[botMove]} ${botMove}`, inline: true },
                { name: "Result", value: rpsResult, inline: false },
              ),
          ],
        });
        break;
      }

      case "slots": {
        const symbols = ["🍒", "🍋", "🍊", "🍇", "⭐", "💎", "🎰", "🃏"];
        const roll = () => symbols[Math.floor(Math.random() * symbols.length)]!;
        const [sa, sb, sc] = [roll(), roll(), roll()];
        const win = sa === sb && sb === sc;
        const almostWin = sa === sb || sb === sc || sa === sc;
        await interaction.reply({
          embeds: [
            new EmbedBuilder().setColor(C).setTitle("🎰 Slot Machine")
              .setDescription(`\`[ ${sa} | ${sb} | ${sc} ]\`\n\n${win ? "🎉 **JACKPOT! You win!**" : almostWin ? "💛 **So close! Two matching!**" : "❌ **No match. Try again!**"}`),
          ],
        });
        break;
      }

      case "trivia": {
        if (!interaction.channel) { await interaction.reply({ content: "❌ Cannot run trivia in this channel.", ephemeral: true }); return; }
        await interaction.deferReply({ ephemeral: true });
        try {
          const res = await fetch("https://opentdb.com/api.php?amount=1&type=multiple&encode=url3986", { signal: AbortSignal.timeout(8000) });
          if (!res.ok) throw new Error();
          const data = await res.json() as { response_code?: number; results?: Array<{ category: string; difficulty: string; question: string; correct_answer: string; incorrect_answers: string[] }> };
          const q = data?.results?.[0];
          if (!q || data.response_code !== 0) throw new Error();
          const dec = (s: string) => s.replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&#039;/g,"'").replace(/&apos;/g,"'").replace(/%27/g,"'").replace(/%22/g,'"').replace(/%26/g,"&").replace(/%3C/g,"<").replace(/%3E/g,">").replace(/%20/g," ");
          const question = dec(q.question);
          const correct = dec(q.correct_answer);
          const all = [...q.incorrect_answers.map(dec), correct].sort(() => Math.random() - 0.5);
          const letters = ["A", "B", "C", "D"];
          const options = all.map((opt, i) => `**${letters[i]}.** ${opt}`).join("\n");
          const triviaMsg = await (interaction.channel as TextChannel).send({
            embeds: [
              new EmbedBuilder().setColor(C).setTitle(`🧠 Trivia — ${dec(q.category)}`)
                .setDescription(`**${question}**\n\n${options}`)
                .setFooter({ text: `Difficulty: ${q.difficulty} • Reply A/B/C/D within 30s | Started by ${interaction.user.username}` }),
            ],
          });
          await interaction.editReply("✅ Trivia question posted in the channel!");
          const filter = (m: any) => m.author.id === interaction.user.id && ["a","b","c","d"].includes(m.content.trim().toLowerCase().charAt(0));
          try {
            const collected = await (interaction.channel as TextChannel).awaitMessages({ filter, max: 1, time: 30_000, errors: ["time"] });
            const answer = collected.first()!;
            const chosen = answer.content.trim().toLowerCase().charAt(0);
            const chosenAnswer = all[letters.indexOf(chosen.toUpperCase())]!;
            if (chosenAnswer === correct) {
              await answer.reply({ embeds: [new EmbedBuilder().setColor(0x00ff00).setDescription(`✅ **Correct!** The answer was **${correct}**.`)] });
            } else {
              await answer.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(`❌ **Wrong!** The correct answer was **${correct}**.`)] });
            }
          } catch {
            await triviaMsg.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(`⏰ Time's up! The correct answer was **${correct}**.`)] });
          }
        } catch { await interaction.editReply("❌ Couldn't fetch a trivia question. Try again!"); }
        break;
      }

      case "guess": {
        if (!interaction.channel) { await interaction.reply({ content: "❌ Cannot run game in this channel.", ephemeral: true }); return; }
        const gMax = Math.min(interaction.options.getInteger("max") ?? 100, 10000);
        const gNum = Math.floor(Math.random() * gMax) + 1;
        await (interaction.channel as TextChannel).send({
          embeds: [new EmbedBuilder().setColor(C).setTitle("🔢 Guess the Number").setDescription(`**${interaction.user.username}** started a guessing game!\nI'm thinking of a number between **1** and **${gMax}**.\n\nYou have **5 attempts**! Type a number to guess.`)],
        });
        await interaction.reply({ content: "🎲 Game started! Check the channel.", ephemeral: true });
        let gAttempts = 0;
        const gFilter = (m: any) => m.author.id === interaction.user.id && !isNaN(parseInt(m.content.trim()));
        const collector = (interaction.channel as TextChannel).createMessageCollector({ filter: gFilter, time: 60_000, max: 5 });
        collector.on("collect", async (m: any) => {
          const guess = parseInt(m.content.trim());
          gAttempts++;
          if (guess === gNum) {
            collector.stop("win");
            await m.reply({ embeds: [new EmbedBuilder().setColor(0x00ff00).setDescription(`🎉 **Correct!** The number was **${gNum}**! Got it in **${gAttempts}** attempt${gAttempts !== 1 ? "s" : ""}!`)] });
          } else if (gAttempts >= 5) {
            collector.stop("lose");
          } else {
            const hint = guess < gNum ? "📈 Too low!" : "📉 Too high!";
            await m.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(`${hint} **${5 - gAttempts}** attempt${5 - gAttempts !== 1 ? "s" : ""} left.`)] });
          }
        });
        collector.on("end", async (_: unknown, reason: string) => {
          if (reason === "win") return;
          await (interaction.channel as TextChannel).send({ embeds: [new EmbedBuilder().setColor(C).setDescription(`💀 Game over! The number was **${gNum}**!`)] }).catch(() => {});
        });
        break;
      }

      default:
        await interaction.reply({ content: "❌ Unknown command.", ephemeral: true });
    }
  } catch (err) {
    logger.error({ err, commandName }, "Error handling slash command");
    if (interaction.replied || interaction.deferred) {
      await interaction.editReply("❌ An error occurred.").catch(() => {});
    } else {
      await interaction.reply({ content: "❌ An error occurred.", ephemeral: true }).catch(() => {});
    }
  }
}
