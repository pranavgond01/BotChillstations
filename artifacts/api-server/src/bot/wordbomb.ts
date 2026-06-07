import {
  EmbedBuilder,
  PermissionFlagsBits,
  type Client,
  type Message,
  type TextChannel,
} from "discord.js";
import { createRequire } from "node:module";
import { db } from "@workspace/db";
import { wordbombWinsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { sql } from "drizzle-orm";

const _require = createRequire(import.meta.url);
const _wordList: string[] = _require("an-array-of-english-words");
const WORD_SET = new Set<string>(_wordList.map((w) => w.toLowerCase()));

function isRealWord(word: string): boolean { return WORD_SET.has(word.toLowerCase()); }

const TRIGRAMS = [
  "ize", "ous", "ing", "tion", "ack", "ell", "ill", "ull", "ang", "ong", "ung", "ant", "ent", "int",
  "ath", "oth", "tra", "str", "the", "her", "ere", "and", "for", "not", "can", "had", "how", "man",
  "new", "now", "old", "our", "out", "own", "say", "she", "two", "way", "who", "got", "let", "put",
  "ask", "big", "day", "get", "has", "its", "may", "off", "run", "set", "sit", "try", "war", "ale",
  "are", "ate", "eve", "ice", "ire", "ore", "use", "ble", "ple", "tle", "gle", "nce", "nse", "eck",
  "ick", "ock", "uck", "ead", "eal", "eat", "eed", "een", "eep", "eer", "eet", "end", "est", "ide",
  "igh", "ind", "ine", "ink", "ion", "ish", "ite", "ive", "oak", "oal",
];

const LIVES = 2;
const LOBBY_TIME = 30_000;
const TURN_TIME = 10_000;
const EMBED_COLOR = 0xff0000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface GameState {
  activePlayers: string[];
  allPlayers: string[];
  lives: Map<string, number>;
  scores: Map<string, number>;
  eliminated: Set<string>;
  usedWords: Set<string>;
  currentIndex: number;
  active: boolean;
}

const activeGames = new Map<string, GameState>();

function randTrigram(): string { return TRIGRAMS[Math.floor(Math.random() * TRIGRAMS.length)]; }
function livesBar(lives: number): string { return "❤️".repeat(Math.max(0, lives)) + "🖤".repeat(Math.max(0, LIVES - lives)); }

async function addWin(guildId: string, userId: string): Promise<void> {
  await db.insert(wordbombWinsTable)
    .values({ guildId, userId, wins: 1 })
    .onConflictDoUpdate({ target: [wordbombWinsTable.guildId, wordbombWinsTable.userId], set: { wins: sql`${wordbombWinsTable.wins} + 1` } });
}

export async function getWbWinsFromDb(guildId: string): Promise<{ userId: string; wins: number }[]> {
  const rows = await db.select().from(wordbombWinsTable)
    .where(eq(wordbombWinsTable.guildId, guildId))
    .orderBy(desc(wordbombWinsTable.wins))
    .limit(10);
  return rows.map((r) => ({ userId: r.userId, wins: r.wins }));
}

export function stopWordbombGame(guildId: string): boolean {
  const state = activeGames.get(guildId);
  if (!state) return false;
  state.active = false;
  activeGames.delete(guildId);
  return true;
}

async function getDisplayName(channel: TextChannel, userId: string): Promise<string> {
  try { const member = await channel.guild.members.fetch(userId); return member.displayName; }
  catch { return `<@${userId}>`; }
}

async function runTurn(channel: TextChannel, state: GameState, currentId: string, trigram: string): Promise<boolean> {
  let resolved = false;
  await channel.send({ content: `<@${currentId}>`, embeds: [new EmbedBuilder().setColor(EMBED_COLOR).setDescription(`☕ Type a word containing the letters: **${trigram.toUpperCase()}**.`)] });

  return new Promise<boolean>((resolve) => {
    const hardTimer = setTimeout(() => { if (!resolved) { resolved = true; collector.stop("timeout"); resolve(false); } }, TURN_TIME);
    const collector = channel.createMessageCollector({ filter: (m) => m.author.id === currentId && !m.author.bot, time: TURN_TIME });
    collector.on("collect", async (m) => {
      const word = m.content.trim().toLowerCase();
      if (!/^[a-z]+$/.test(word)) return;
      if (!word.includes(trigram.toLowerCase())) { await m.react("❌").catch(() => {}); await m.reply(`❌ **${word}** doesn't contain **\`${trigram.toUpperCase()}\`**!`).catch(() => {}); return; }
      if (!isRealWord(word)) { await m.react("❌").catch(() => {}); return; }
      if (state.usedWords.has(word)) { await m.react("❌").catch(() => {}); return; }
      state.usedWords.add(word);
      resolved = true;
      clearTimeout(hardTimer);
      collector.stop("answered");
      await m.react("✅").catch(() => {});
      resolve(true);
    });
    collector.on("end", (_c, _reason) => { if (!resolved) { resolved = true; clearTimeout(hardTimer); resolve(false); } });
  });
}

async function runGame(channel: TextChannel, state: GameState, guildId: string): Promise<void> {
  while (state.active) {
    state.activePlayers = state.activePlayers.filter((id) => (state.lives.get(id) ?? 0) > 0);
    if (state.activePlayers.length < 2) {
      const winnerId = state.activePlayers[0];
      if (winnerId) {
        await addWin(guildId, winnerId);
        const name = await getDisplayName(channel, winnerId);
        await channel.send({ embeds: [new EmbedBuilder().setColor(EMBED_COLOR).setDescription(`🏆 **${name}** has won the game! 🏆`)] });
      } else {
        await channel.send({ embeds: [new EmbedBuilder().setColor(EMBED_COLOR).setDescription("💀 Everyone was eliminated! No winner.")] });
      }
      state.active = false;
      activeGames.delete(guildId);
      return;
    }
    if (state.currentIndex >= state.activePlayers.length) state.currentIndex = 0;
    const currentId = state.activePlayers[state.currentIndex];
    const trigram = randTrigram();
    const answered = await runTurn(channel, state, currentId, trigram);
    if (answered) {
      state.scores.set(currentId, (state.scores.get(currentId) ?? 0) + 1);
    } else {
      const remaining = (state.lives.get(currentId) ?? 1) - 1;
      state.lives.set(currentId, remaining);
      if (remaining <= 0) {
        state.eliminated.add(currentId);
        const name = await getDisplayName(channel, currentId);
        await channel.send({ embeds: [new EmbedBuilder().setColor(EMBED_COLOR).setDescription(`🚪 **${name}** has been **eliminated**!`)] });
      } else {
        await channel.send({ embeds: [new EmbedBuilder().setColor(EMBED_COLOR).setDescription(`💥 <@${currentId}> lost a life! ${livesBar(remaining)}`)] });
      }
    }
    state.currentIndex = (state.currentIndex + 1) % state.activePlayers.length;
    await sleep(1200);
  }
}

export async function startWordbombInChannel(channel: TextChannel, starterId: string, guildId: string): Promise<void> {
  if (activeGames.has(guildId)) {
    await channel.send({ embeds: [new EmbedBuilder().setColor(EMBED_COLOR).setDescription("❌ A Word Bomb game is already running in this server!")] });
    return;
  }

  const lobbyMsg = await channel.send({
    embeds: [
      new EmbedBuilder().setColor(EMBED_COLOR).setDescription(
        `⏰ Waiting for **players**, react with ✅ to join. The game will begin in **30** seconds.\n\n` +
        `\`GOAL:\` You have **10** seconds to say a word containing the given group of **3** letters. ` +
        `Failure to do so will lose a life. Each player has **${LIVES}** lives.\n\n` +
        `\`NOTES:\` A word can only be used **once** through the course of the game.`
      ),
    ],
  });
  await lobbyMsg.react("✅");
  await sleep(LOBBY_TIME);

  const reaction = lobbyMsg.reactions.cache.get("✅");
  const reactedUsers = reaction ? [...(await reaction.users.fetch()).values()].filter((u) => !u.bot) : [];

  if (reactedUsers.length < 2) {
    await channel.send({ embeds: [new EmbedBuilder().setColor(EMBED_COLOR).setDescription("❌ Not enough players joined (need at least **2**). Game cancelled.")] });
    return;
  }

  const players = reactedUsers.map((u) => u.id);
  const lives = new Map<string, number>(players.map((id) => [id, LIVES]));
  const scores = new Map<string, number>(players.map((id) => [id, 0]));
  const state: GameState = { activePlayers: [...players], allPlayers: [...players], lives, scores, eliminated: new Set(), usedWords: new Set(), currentIndex: 0, active: true };
  activeGames.set(guildId, state);

  const displayNames = new Map<string, string>();
  for (const id of players) displayNames.set(id, await getDisplayName(channel, id));
  const playerLines = players.map((id) => `${livesBar(LIVES)} @${displayNames.get(id) ?? id}`).join("\n");
  await channel.send({ embeds: [new EmbedBuilder().setColor(EMBED_COLOR).setTitle("💣 Word Bomb — Starting!").setDescription(`**${players.length} players** are ready!\n\n${playerLines}`)] });
  await sleep(2000);
  await runGame(channel, state, guildId);
}

export async function handleWordbomb(client: Client, message: Message): Promise<void> {
  if (!message.guild) return;
  const member = message.guild.members.cache.get(message.author.id);
  if (!member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(EMBED_COLOR).setDescription("❌ Only **admins** (Manage Server) can start Word Bomb.")] });
    return;
  }
  await startWordbombInChannel(message.channel as TextChannel, message.author.id, message.guild.id);
}

export async function handleWordbombStop(message: Message): Promise<void> {
  if (!message.guild) return;
  const member = message.guild.members.cache.get(message.author.id);
  if (!member?.permissions.has(PermissionFlagsBits.ManageGuild)) { await message.reply("❌ You need **Manage Server** permission."); return; }
  const stopped = stopWordbombGame(message.guild.id);
  if (!stopped) { await message.reply({ embeds: [new EmbedBuilder().setColor(EMBED_COLOR).setDescription("❌ No active Word Bomb game.")] }); return; }
  await message.reply({ embeds: [new EmbedBuilder().setColor(EMBED_COLOR).setDescription("🛑 The Word Bomb game has been **stopped**.")] });
}

export async function handleWbTop(message: Message): Promise<void> {
  if (!message.guild) return;
  const wins = await getWbWinsFromDb(message.guild.id);
  if (wins.length === 0) { await message.reply("📊 No Word Bomb games have been won yet!"); return; }
  const medals = ["🥇", "🥈", "🥉"];
  const lines = wins.map(({ userId, wins: w }, i) => `${medals[i] ?? `**${i + 1}.**`} <@${userId}> — **${w}** win${w !== 1 ? "s" : ""}`);
  await message.reply({ embeds: [new EmbedBuilder().setColor(EMBED_COLOR).setTitle("🏆 Word Bomb — Leaderboard").setDescription(lines.join("\n")).setFooter({ text: "Most Word Bomb wins" })] });
}
