import {
  type Message,
  type Client,
  type TextChannel,
  PermissionFlagsBits,
  EmbedBuilder,
} from "discord.js";
import { handleAfk } from "./afk";
import { handleWarn, handleWarnings, handleClearWarnings } from "./warn";
import { handleMute, handleUnmute } from "./mute";
import { handleWordbomb, handleWordbombStop, handleWbTop } from "./wordbomb";
import { handlePurge, handlePurgeBot } from "./purge";
import { hasNoPrefix, handleNoPrefix } from "./noprefix";
import { handleHelp } from "./help";
import { startGiveaway, endGiveaway, rerollGiveaway, parseDuration } from "./giveaway";
import {
  handleKick, handleBan, handleUnban, handleNuke, handleSlowmode, handleLock, handleUnlock,
  handleSoftban, handleHackban, handleVoiceMute, handleVoiceUnmute,
  handleDeafen, handleUndeafen, handleMove, handleVoiceKick, handleBanList, handleClearReactions,
} from "./moderation";
import {
  handleUserInfo, handleServerInfo, handleAvatar, handleRole, handleNick,
  handleAnnounce, handleServerIcon, handleBanner,
  handleRoleInfo, handleChannelInfo, handleInviteInfo, handleInvites,
  handlePermissions, handleInRole, handleBoosters, handleFirstMessage,
  handleRoleIcon,
} from "./utility";
import { handleSetModlog, handleCaseLookup, handleCaseList } from "./cases";
import { handlePoll } from "./poll";
import { handleRR } from "./reactionroles";
import { handleSetWelcome } from "./welcome";
import { handleSetLeave } from "./leave";
import { handleVanityRole } from "./vanityrole";
import { handleSnipe } from "./snipe";
import { handleTrigger, processTriggers } from "./autotrigger";
import { handleTicket } from "./ticket";
import { handleLeaderboard, handleLbReset, handleSetLb, trackMessage } from "./leaderboard";
import { handleRank } from "./rank";
import { handleSend, handleSay, handleEmbed, handleDm } from "./send";
import {
  handlePing, handleEightBall, handleCoinflip, handleDice,
  handleMembers, handleBotInfo, handleRemind, handleColor,
  handleChoose, handleRepeat, handleHide, handleUnhide, handleSteal, handleEmoji,
} from "./extras";
import { handleCalc } from "./calc";
import { handleAntiNuke } from "./antinuke";
import { handleAutoMod, processAutoMod } from "./automod";
import { getPrefix, setPrefix } from "./prefix";
import { handleAutoRole } from "./autorole";
import { handleSticky, handleStickyOnMessage } from "./sticky";
import { handleAutoReact, handleAutoReactOnMessage } from "./autoreact";
import { handleSetup } from "./setup";
import {
  handleJoke, handleDadJoke, handleFact, handleQuote, handleRoast, handleCompliment,
  handleTopic, handleShip, handleRate, handleReverse, handleMock, handleClap,
  handleUpper, handleLower, handleEmojify, handleBinary, handleMorse, handleBase64,
  handlePassword, handleRandomNumber, handlePercent, handleYesNo, handleLength,
  handleTempConvert, handleUrban, handleWikipedia,
  handleCat, handleDog, handleFox, handleDuck,
  handleHug, handlePat, handleSlap, handlePoke, handleKiss, handleWave,
  handleHighfive, handleCry, handleCuddle, handleBite, handleBonk, handleKill,
  handleRPS, handleSlots, handleTrivia, handleGuess,
} from "./fun";

const PREFIX = "g";

async function handleSetPrefix(message: Message): Promise<void> {
  if (!message.guild) return;
  if (!message.member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription("❌ You need **Manage Server** permission.")] });
    return;
  }
  const args = message.content.trim().split(/\s+/);
  const newPrefix = args[1];
  if (!newPrefix || newPrefix.length > 5) {
    const current = getPrefix(message.guild.id);
    await message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription(`❌ Usage: \`!setprefix <prefix>\`\nCurrent prefix: \`${current}\`\n*Max 5 characters.*`)] });
    return;
  }
  await setPrefix(message.guild.id, newPrefix);
  await message.reply({ embeds: [new EmbedBuilder().setColor(0x57f287).setDescription(`✅ Server prefix changed to \`${newPrefix}\`\nAll commands now use \`${newPrefix}help\`, \`${newPrefix}ban\`, etc.`)] });
}

function m(lower: string, cmd: string): boolean {
  return lower === `!${cmd}` || lower.startsWith(`!${cmd} `);
}

export async function handleMessage(client: Client, message: Message): Promise<void> {
  if (message.author.bot) return;
  if (!message.guild) return;

  trackMessage(message.guild.id, message.author.id);

  const raw = message.content.trim();
  const noPrefix = hasNoPrefix(message);
  const p = getPrefix(message.guild.id); // per-guild prefix (default "!")

  // Normalize to "!" internally for routing
  let content: string;
  if (raw.startsWith(p)) {
    content = `!${raw.slice(p.length)}`;
  } else if (noPrefix) {
    // No-prefix role holders can type commands without any prefix
    content = `!${raw}`;
  } else {
    // Still run AFK + triggers + automod for all messages, then bail
    try { await handleAfk(message, raw); } catch { /* non-fatal */ }
    try { await processTriggers(message); } catch { /* non-fatal */ }
    try { await processAutoMod(message); } catch { /* non-fatal */ }
    return;
  }

  try { await handleAfk(message, content); } catch { /* non-fatal */ }
  try { await processTriggers(message); } catch { /* non-fatal */ }
  try { if (await processAutoMod(message)) return; } catch { /* non-fatal */ }
  try { await handleStickyOnMessage(message); } catch { /* non-fatal */ }
  try { await handleAutoReactOnMessage(message); } catch { /* non-fatal */ }

  const lower = content.toLowerCase();
  if (m(lower, `${PREFIX}start`)) {
    await handleGstart(client, message);

  // ── Giveaway ───────────────────────────────────────────────────────────────
  } else if (m(lower, `${PREFIX}end`)) {
    await handleGend(client, message);
  } else if (m(lower, `${PREFIX}reroll`)) {
    await handleGreroll(client, message);

  // ── Help ───────────────────────────────────────────────────────────────────
  } else if (lower === `!${PREFIX}help` || lower === "!help" || lower.startsWith("!help ")) {
    await handleHelp(message);

  // ── Moderation ─────────────────────────────────────────────────────────────
  } else if (m(lower, "warn")) {
    await handleWarn(client, message);
  } else if (m(lower, "warnings")) {
    await handleWarnings(message);
  } else if (m(lower, "clearwarnings")) {
    await handleClearWarnings(message);
  } else if (m(lower, "mute")) {
    await handleMute(client, message);
  } else if (m(lower, "unmute")) {
    await handleUnmute(client, message);
  } else if (m(lower, "kick")) {
    await handleKick(client, message);
  } else if (m(lower, "softban")) {
    await handleSoftban(client, message);
  } else if (m(lower, "hackban")) {
    await handleHackban(client, message);
  } else if (m(lower, "ban")) {
    await handleBan(client, message);
  } else if (m(lower, "unban")) {
    await handleUnban(client, message);
  } else if (lower === "!nuke") {
    await handleNuke(message);
  } else if (m(lower, "slowmode")) {
    await handleSlowmode(message);
  } else if (lower === "!lock") {
    await handleLock(message);
  } else if (lower === "!unlock") {
    await handleUnlock(message);
  } else if (m(lower, "purge")) {
    await handlePurge(message);
  } else if (m(lower, "pb")) {
    await handlePurgeBot(message);
  } else if (m(lower, "setprefix")) {
    await handleSetPrefix(message);
  } else if (m(lower, "noprefix")) {
    await handleNoPrefix(message);
  } else if (m(lower, "vmute") || m(lower, "voicemute")) {
    await handleVoiceMute(message);
  } else if (m(lower, "vunmute") || m(lower, "voiceunmute")) {
    await handleVoiceUnmute(message);
  } else if (m(lower, "deafen")) {
    await handleDeafen(message);
  } else if (m(lower, "undeafen")) {
    await handleUndeafen(message);
  } else if (m(lower, "move")) {
    await handleMove(message);
  } else if (m(lower, "voicekick") || m(lower, "vkick")) {
    await handleVoiceKick(message);
  } else if (lower === "!banlist") {
    await handleBanList(message);
  } else if (m(lower, "clearreactions") || m(lower, "cr")) {
    await handleClearReactions(message);

  // ── Cases ──────────────────────────────────────────────────────────────────
  } else if (m(lower, "setmodlog")) {
    await handleSetModlog(message);
  } else if (m(lower, "case")) {
    await handleCaseLookup(message);
  } else if (m(lower, "cases")) {
    await handleCaseList(message);

  // ── Utility ────────────────────────────────────────────────────────────────
  } else if (m(lower, "userinfo") || m(lower, "whois")) {
    await handleUserInfo(message);
  } else if (lower === "!serverinfo") {
    await handleServerInfo(message);
  } else if (lower === "!servericon") {
    await handleServerIcon(message);
  } else if (m(lower, "banner")) {
    await handleBanner(message);
  } else if (m(lower, "avatar") || m(lower, "av")) {
    await handleAvatar(message);
  } else if (m(lower, "roleicon")) {
    await handleRoleIcon(message);
  } else if (m(lower, "role")) {
    await handleRole(message);
  } else if (m(lower, "nick")) {
    await handleNick(message);
  } else if (m(lower, "announce")) {
    await handleAnnounce(message);
  } else if (m(lower, "roleinfo") || m(lower, "ri")) {
    await handleRoleInfo(message);
  } else if (m(lower, "channelinfo") || m(lower, "ci")) {
    await handleChannelInfo(message);
  } else if (m(lower, "inviteinfo")) {
    await handleInviteInfo(message);
  } else if (m(lower, "invites")) {
    await handleInvites(message);
  } else if (m(lower, "permissions") || m(lower, "perms")) {
    await handlePermissions(message);
  } else if (m(lower, "inrole")) {
    await handleInRole(message);
  } else if (lower === "!boosters") {
    await handleBoosters(message);
  } else if (lower === "!firstmsg" || lower.startsWith("!firstmsg ") || lower === "!firstmessage") {
    await handleFirstMessage(message);

  // ── Messaging ──────────────────────────────────────────────────────────────
  } else if (m(lower, "send")) {
    await handleSend(message);
  } else if (m(lower, "say")) {
    await handleSay(message);
  } else if (m(lower, "embed")) {
    await handleEmbed(message);
  } else if (m(lower, "dm")) {
    await handleDm(message);
  } else if (m(lower, "repeat")) {
    await handleRepeat(message);

  // ── Poll ───────────────────────────────────────────────────────────────────
  } else if (m(lower, "poll")) {
    await handlePoll(message);

  // ── Reaction Roles ─────────────────────────────────────────────────────────
  } else if (m(lower, "rr")) {
    await handleRR(message);

  // ── Welcome / Leave ────────────────────────────────────────────────────────
  } else if (m(lower, "setwelcome")) {
    await handleSetWelcome(message);
  } else if (m(lower, "setleave")) {
    await handleSetLeave(message);
  } else if (m(lower, "vanityrole")) {
    await handleVanityRole(client, message);

  // ── Snipe ──────────────────────────────────────────────────────────────────
  } else if (lower === "!snipe") {
    await handleSnipe(message);

  // ── Auto Trigger ───────────────────────────────────────────────────────────
  } else if (m(lower, "trigger")) {
    await handleTrigger(message);

  // ── Ticket ─────────────────────────────────────────────────────────────────
  } else if (m(lower, "ticket")) {
    await handleTicket(client, message);

  // ── Leaderboard ────────────────────────────────────────────────────────────
  } else if (lower === "!lb" || lower.startsWith("!lb ") || lower === "!leaderboard" || lower.startsWith("!leaderboard ")) {
    await handleLeaderboard(message);
  } else if (m(lower, "lbreset")) {
    await handleLbReset(message);
  } else if (m(lower, "setlb")) {
    await handleSetLb(client, message);

  // ── Rank ───────────────────────────────────────────────────────────────────
  } else if (m(lower, "rank")) {
    await handleRank(message);

  // ── Extras (ping, 8ball, etc.) ─────────────────────────────────────────────
  } else if (lower === "!ping") {
    await handlePing(client, message);
  } else if (m(lower, "8ball")) {
    await handleEightBall(message);
  } else if (lower === "!coinflip" || lower === "!cf") {
    await handleCoinflip(message);
  } else if (m(lower, "dice")) {
    await handleDice(message);
  } else if (lower === "!members") {
    await handleMembers(message);
  } else if (lower === "!botinfo") {
    await handleBotInfo(client, message);
  } else if (m(lower, "remind")) {
    await handleRemind(message);
  } else if (m(lower, "color")) {
    await handleColor(message);
  } else if (m(lower, "choose")) {
    await handleChoose(message);

  // ── Word Bomb ──────────────────────────────────────────────────────────────
  } else if (lower === "!wordbomb" || lower === "!wb") {
    await handleWordbomb(client, message);
  } else if (lower === "!wbstop" || lower === "!wordbomb stop") {
    await handleWordbombStop(message);
  } else if (lower === "!wbtop") {
    await handleWbTop(message);

  // ── Calculator ─────────────────────────────────────────────────────────────
  } else if (m(lower, "calc")) {
    await handleCalc(message);

  // ── Anti-Nuke ──────────────────────────────────────────────────────────────
  } else if (m(lower, "antinuke")) {
    await handleAntiNuke(message);

  // ── AutoMod ────────────────────────────────────────────────────────────────
  } else if (m(lower, "automod")) {
    await handleAutoMod(message);

  // ── Auto Role ──────────────────────────────────────────────────────────────
  } else if (m(lower, "autorole")) {
    await handleAutoRole(message);

  // ── Sticky Message ─────────────────────────────────────────────────────────
  } else if (m(lower, "sticky")) {
    await handleSticky(message);

  // ── Auto React ─────────────────────────────────────────────────────────────
  } else if (m(lower, "autoreact") || m(lower, "ar")) {
    await handleAutoReact(message);

  // ── Setup ──────────────────────────────────────────────────────────────────
  } else if (lower === "!setup") {
    await handleSetup(message);

  // ── Hide / Unhide / Steal / Emoji ──────────────────────────────────────────
  } else if (lower === "!hide" || lower.startsWith("!hide ")) {
    await handleHide(message);
  } else if (lower === "!unhide" || lower.startsWith("!unhide ")) {
    await handleUnhide(message);
  } else if (m(lower, "steal")) {
    await handleSteal(message);
  } else if (m(lower, "emoji")) {
    await handleEmoji(message);

  // ── Fun ────────────────────────────────────────────────────────────────────
  } else if (lower === "!joke" || lower.startsWith("!joke ")) {
    await handleJoke(message);
  } else if (lower === "!dadjoke" || lower === "!dj") {
    await handleDadJoke(message);
  } else if (lower === "!fact") {
    await handleFact(message);
  } else if (lower === "!quote") {
    await handleQuote(message);
  } else if (m(lower, "roast")) {
    await handleRoast(message);
  } else if (m(lower, "compliment")) {
    await handleCompliment(message);
  } else if (lower === "!topic") {
    await handleTopic(message);
  } else if (m(lower, "ship")) {
    await handleShip(message);
  } else if (m(lower, "rate")) {
    await handleRate(message);
  } else if (m(lower, "reverse")) {
    await handleReverse(message);
  } else if (m(lower, "mock")) {
    await handleMock(message);
  } else if (m(lower, "clap")) {
    await handleClap(message);
  } else if (m(lower, "upper")) {
    await handleUpper(message);
  } else if (m(lower, "lower")) {
    await handleLower(message);
  } else if (m(lower, "emojify")) {
    await handleEmojify(message);
  } else if (m(lower, "binary")) {
    await handleBinary(message);
  } else if (m(lower, "morse")) {
    await handleMorse(message);
  } else if (m(lower, "base64") || m(lower, "b64")) {
    await handleBase64(message);
  } else if (m(lower, "password") || m(lower, "pass")) {
    await handlePassword(message);
  } else if (m(lower, "random") || m(lower, "rand")) {
    await handleRandomNumber(message);
  } else if (lower === "!percent") {
    await handlePercent(message);
  } else if (lower === "!yesno") {
    await handleYesNo(message);
  } else if (m(lower, "length") || m(lower, "len")) {
    await handleLength(message);
  } else if (m(lower, "temp")) {
    await handleTempConvert(message);
  } else if (m(lower, "urban") || m(lower, "ud")) {
    await handleUrban(message);
  } else if (m(lower, "wiki") || m(lower, "wikipedia")) {
    await handleWikipedia(message);

  // ── Animals ────────────────────────────────────────────────────────────────
  } else if (lower === "!cat") {
    await handleCat(message);
  } else if (lower === "!dog") {
    await handleDog(message);
  } else if (lower === "!fox") {
    await handleFox(message);
  } else if (lower === "!duck") {
    await handleDuck(message);

  // ── Social Reactions ───────────────────────────────────────────────────────
  } else if (m(lower, "hug")) {
    await handleHug(message);
  } else if (m(lower, "pat")) {
    await handlePat(message);
  } else if (m(lower, "slap")) {
    await handleSlap(message);
  } else if (m(lower, "poke")) {
    await handlePoke(message);
  } else if (m(lower, "kiss")) {
    await handleKiss(message);
  } else if (lower === "!wave" || lower.startsWith("!wave ")) {
    await handleWave(message);
  } else if (m(lower, "highfive") || m(lower, "hf")) {
    await handleHighfive(message);
  } else if (lower === "!cry") {
    await handleCry(message);
  } else if (m(lower, "cuddle")) {
    await handleCuddle(message);
  } else if (m(lower, "bite")) {
    await handleBite(message);
  } else if (m(lower, "bonk")) {
    await handleBonk(message);
  } else if (m(lower, "kill")) {
    await handleKill(message);

  // ── Games ──────────────────────────────────────────────────────────────────
  } else if (m(lower, "rps")) {
    await handleRPS(message);
  } else if (lower === "!slots") {
    await handleSlots(message);
  } else if (lower === "!trivia") {
    await handleTrivia(message);
  } else if (lower === "!guess" || lower.startsWith("!guess ")) {
    await handleGuess(message);
  }
}

async function handleGstart(client: Client, message: Message): Promise<void> {
  const member = message.guild!.members.cache.get(message.author.id);
  if (!member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
    await message.reply("❌ You need the **Manage Server** permission to start giveaways.");
    return;
  }
  const args = message.content.trim().split(/\s+/).slice(1);
  if (args.length < 2) {
    await message.reply("❌ Usage: `!gstart <duration> [winners] <prize>`\nExample: `!gstart 1d 1 Nitro`");
    return;
  }
  const duration = parseDuration(args[0]);
  if (!duration) {
    await message.reply("❌ Invalid duration. Use `30s`, `5m`, `2h`, `1d`.");
    return;
  }
  let winnerCount = 1;
  let prizeStart = 1;
  if (args.length >= 3 && /^\d+$/.test(args[1] ?? "")) {
    winnerCount = Math.max(1, Math.min(20, parseInt(args[1] ?? "1")));
    prizeStart = 2;
  }
  const prize = args.slice(prizeStart).join(" ");
  if (!prize) { await message.reply("❌ Please provide a prize name."); return; }
  const result = await startGiveaway(client, message.channel as TextChannel, message.author.id, message.guild!.id, duration, prize, winnerCount);
  if (result.success) await message.delete().catch(() => {});
  else await message.reply(`❌ ${result.message}`);
}

async function handleGend(client: Client, message: Message): Promise<void> {
  const member = message.guild!.members.cache.get(message.author.id);
  if (!member?.permissions.has(PermissionFlagsBits.ManageGuild)) { await message.reply("❌ You need **Manage Server** permission."); return; }
  const args = message.content.trim().split(/\s+/).slice(1);
  if (!args[0]) { await message.reply("❌ Usage: `!gend <message_id>`"); return; }
  const result = await endGiveaway(client, args[0]);
  if (!result.success) await message.reply(`❌ ${result.message}`);
}

async function handleGreroll(client: Client, message: Message): Promise<void> {
  const member = message.guild!.members.cache.get(message.author.id);
  if (!member?.permissions.has(PermissionFlagsBits.ManageGuild)) { await message.reply("❌ You need **Manage Server** permission."); return; }
  const args = message.content.trim().split(/\s+/).slice(1);
  if (!args[0]) { await message.reply("❌ Usage: `!greroll <message_id> [amount]`"); return; }
  let winnerOverride: number | undefined;
  if (args[1]) {
    const n = parseInt(args[1]);
    if (isNaN(n) || n < 1 || n > 20) { await message.reply("❌ Amount must be 1–20."); return; }
    winnerOverride = n;
  }
  const result = await rerollGiveaway(client, args[0], winnerOverride);
  if (!result.success) await message.reply(`❌ ${result.message}`);
}
