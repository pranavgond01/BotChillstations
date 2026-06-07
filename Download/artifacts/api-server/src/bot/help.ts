import {
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ComponentType,
  type Message,
  type ChatInputCommandInteraction,
} from "discord.js";

const C = 0xff0000;
const TIMEOUT = 120_000;
const BOT_INVITE = "https://discord.com/oauth2/authorize?client_id=1397872401299144744";

interface Cmd { name: string; desc: string; }
interface Category { id: string; label: string; emoji: string; blurb: string; commands: Cmd[]; slash: Cmd[]; }

export const CATEGORIES: Category[] = [
  {
    id: "giveaway", label: "Giveaway", emoji: "🎉",
    blurb: "Run giveaways in your server.",
    commands: [
      { name: "!gstart <dur> [winners] <prize>", desc: "Start a giveaway. e.g. `!gstart 1d 2 Nitro`" },
      { name: "!gend <msg_id>", desc: "End a giveaway early." },
      { name: "!greroll <msg_id> [amount]", desc: "Reroll winner(s)." },
    ],
    slash: [
      { name: "/giveaway start <duration> <prize>", desc: "Start a new giveaway." },
      { name: "/giveaway end <message_id>", desc: "End a giveaway early." },
      { name: "/giveaway reroll <message_id>", desc: "Reroll winner(s)." },
    ],
  },
  {
    id: "moderation", label: "Moderation", emoji: "🛡️",
    blurb: "Keep your server safe.",
    commands: [
      { name: "!warn @user [reason]", desc: "Warn a user." },
      { name: "!warnings @user", desc: "View all warnings for a user." },
      { name: "!clearwarnings @user", desc: "Clear all warnings." },
      { name: "!mute @user <dur> [reason]", desc: "Timeout a user. e.g. `!mute @user 10m spam`" },
      { name: "!unmute @user", desc: "Remove a timeout." },
      { name: "!kick @user [reason]", desc: "Kick a user." },
      { name: "!ban @user [reason]", desc: "Ban a user." },
      { name: "!softban @user [reason]", desc: "Ban+unban to clear messages without permanent ban." },
      { name: "!hackban <user_id> [reason]", desc: "Ban a user not in the server by ID." },
      { name: "!unban <user_id>", desc: "Unban a user by ID." },
      { name: "!banlist", desc: "List all banned users." },
      { name: "!nuke", desc: "Delete all messages in the channel (30s confirm)." },
      { name: "!purge <n>", desc: "Delete last N messages (max 100)." },
      { name: "!pb <n>", desc: "Delete last N bot messages." },
      { name: "!slowmode <sec>", desc: "Set slowmode (`0` to disable)." },
      { name: "!lock", desc: "Lock the channel for everyone." },
      { name: "!unlock", desc: "Unlock the channel." },
      { name: "!vmute @user", desc: "Server-mute in voice. Alias: `!voicemute`" },
      { name: "!vunmute @user", desc: "Remove server-mute. Alias: `!voiceunmute`" },
      { name: "!deafen @user", desc: "Server-deafen in voice." },
      { name: "!undeafen @user", desc: "Remove server-deafen." },
      { name: "!move @user #vc", desc: "Move a member to another voice channel." },
      { name: "!voicekick @user", desc: "Disconnect a member from voice. Alias: `!vkick`" },
      { name: "!clearreactions <msg_id>", desc: "Clear all reactions from a message. Alias: `!cr`" },
    ],
    slash: [
      { name: "/ban @user [reason]", desc: "Ban a member." },
      { name: "/kick @user [reason]", desc: "Kick a member." },
      { name: "/mute @user <duration> [reason]", desc: "Timeout a member." },
      { name: "/unmute @user", desc: "Remove a timeout." },
      { name: "/warn @user [reason]", desc: "Warn a member." },
      { name: "/warnings @user", desc: "View warnings for a member." },
      { name: "/clearwarnings @user", desc: "Clear all warnings." },
      { name: "/unban <user_id>", desc: "Unban a user." },
      { name: "/slowmode <seconds>", desc: "Set channel slowmode." },
      { name: "/lock / /unlock", desc: "Lock or unlock the channel." },
      { name: "/purge <amount>", desc: "Delete last N messages." },
    ],
  },
  {
    id: "security", label: "Security", emoji: "🔐",
    blurb: "Anti-nuke, automod, and server setup.",
    commands: [
      { name: "!antinuke enable / disable", desc: "Enable or disable anti-nuke. *(Admin)*" },
      { name: "!antinuke status", desc: "Show anti-nuke config." },
      { name: "!antinuke threshold <ban|channel|role> <n>", desc: "Set action threshold." },
      { name: "!antinuke whitelist @user", desc: "Add/remove trusted user from whitelist." },
      { name: "!antinuke logs #channel", desc: "Set anti-nuke alert channel." },
      { name: "!automod enable / disable", desc: "Enable or disable automod. *(Manage Server)*" },
      { name: "!automod status", desc: "Show automod config." },
      { name: "!automod badwords add/remove/list/clear [word]", desc: "Manage the blocked word list." },
      { name: "!automod spam <2–20>", desc: "Mute users who spam X+ messages in 5s." },
      { name: "!automod caps <10–100|off>", desc: "Delete messages with too many caps." },
      { name: "!automod links <on|off>", desc: "Block external links." },
      { name: "!automod invites <on|off>", desc: "Block Discord invite links." },
      { name: "!automod logs #channel", desc: "Set automod log channel." },
      { name: "!automod exempt @role", desc: "Toggle role exemption from automod." },
      { name: "!setup", desc: "Auto-create roles, categories, and channels. *(Admin)*" },
    ],
    slash: [
      { name: "/antinuke enable / disable / status", desc: "Manage anti-nuke protection." },
      { name: "/antinuke action <type>", desc: "Set nuker punishment (ban/kick/derank)." },
      { name: "/antinuke whitelist @user", desc: "Whitelist a trusted user." },
      { name: "/antinuke logs #channel", desc: "Set anti-nuke alert channel." },
      { name: "/automod enable / disable / status", desc: "Manage automod." },
      { name: "/automod badwords add/remove/list", desc: "Manage blocked words." },
      { name: "/automod logs #channel", desc: "Set automod log channel." },
      { name: "/setup", desc: "Auto-create roles, categories, and channels." },
    ],
  },
  {
    id: "cases", label: "Cases & Mod Log", emoji: "📋",
    blurb: "Track and look up moderation cases.",
    commands: [
      { name: "!setmodlog #channel", desc: "Set the mod-log channel." },
      { name: "!case <id>", desc: "Look up a specific case by ID." },
      { name: "!cases [@user]", desc: "List last 10 cases, optionally filtered by user." },
    ],
    slash: [
      { name: "/setmodlog #channel", desc: "Set the mod-log channel." },
      { name: "/case <id>", desc: "Look up a case by ID." },
      { name: "/cases [@user]", desc: "List recent mod cases." },
    ],
  },
  {
    id: "config", label: "Config", emoji: "⚙️",
    blurb: "Configure the bot for your server.",
    commands: [
      { name: "!setwelcome #channel", desc: "Set the welcome channel." },
      { name: "!setwelcome message <text>", desc: "Set welcome message. Placeholders: `{user}` `{username}` `{server}` `{count}`" },
      { name: "!setwelcome test / disable", desc: "Preview or disable welcome messages." },
      { name: "!setleave #channel", desc: "Set the leave channel." },
      { name: "!setleave message <text>", desc: "Set leave message." },
      { name: "!setleave test / disable", desc: "Preview or disable leave messages." },
      { name: "!setlb #channel [vc|chat] [period]", desc: "Post a live auto-updating leaderboard." },
      { name: "!noprefix [@role|remove]", desc: "Set a role that can skip the `!` prefix." },
      { name: "!setprefix <prefix>", desc: "Set a custom command prefix for this server." },
      { name: "!vanityrole set @role", desc: "Give a role to members with the server vanity URL." },
      { name: "!vanityrole url <code>", desc: "Set the vanity code to scan for." },
      { name: "!vanityrole check / disable", desc: "Scan members or disable vanity role." },
      { name: "!autorole set @role", desc: "Assign a role to every new member on join." },
      { name: "!autorole remove @role", desc: "Remove an auto role." },
      { name: "!autorole list", desc: "List all auto roles." },
      { name: "!sticky set <msg>", desc: "Pin a sticky message that stays at the bottom." },
      { name: "!sticky remove", desc: "Remove the sticky from this channel." },
      { name: "!sticky list", desc: "List all sticky messages in this server." },
      { name: "!autoreact set [#ch] <emoji>", desc: "Auto-react with emoji to every message. Alias: `!ar`" },
      { name: "!autoreact remove [#ch] [emoji]", desc: "Remove an auto react." },
      { name: "!autoreact list", desc: "List all auto reacts." },
    ],
    slash: [
      { name: "/welcome set #channel", desc: "Set welcome channel." },
      { name: "/welcome message <text>", desc: "Set welcome message. Placeholders: `{user}` `{server}` `{count}`" },
      { name: "/welcome test / disable", desc: "Preview or disable welcome messages." },
      { name: "/leave set #channel", desc: "Set leave channel." },
      { name: "/leave message <text>", desc: "Set leave message." },
      { name: "/setlb #channel [vc|chat] [period]", desc: "Post a live leaderboard." },
      { name: "/noprefix @role", desc: "Set no-prefix role." },
      { name: "/setprefix <prefix>", desc: "Set custom prefix." },
      { name: "/vanityrole set @role", desc: "Set vanity role." },
      { name: "/autorole set/remove/list", desc: "Manage auto-join roles." },
      { name: "/sticky set/remove/list", desc: "Manage sticky messages." },
      { name: "/autoreact set/remove/list", desc: "Manage auto reactions." },
    ],
  },
  {
    id: "messaging", label: "Messaging", emoji: "📨",
    blurb: "Send messages, embeds, and DMs as the bot.",
    commands: [
      { name: "!send <msg>", desc: "Send a message as the bot." },
      { name: "!send #channel <msg>", desc: "Send to a specific channel." },
      { name: "!say <msg>", desc: "Bot says something, deletes your message." },
      { name: "!embed <title> | <desc>", desc: "Send a custom embed." },
      { name: "!dm @user <msg>", desc: "DM a user as the bot." },
      { name: "!repeat <n 1-10> <msg>", desc: "Send a message N times." },
      { name: "!announce #channel <msg>", desc: "Send an embed announcement." },
      { name: "!snipe", desc: "Show the last deleted message in this channel." },
    ],
    slash: [
      { name: "/send <content> [#channel]", desc: "Send a message as the bot." },
      { name: "/say <message>", desc: "Bot says something here." },
      { name: "/embed <description> [title] [footer] [#channel]", desc: "Send a custom embed." },
      { name: "/dm @user <message>", desc: "DM a user as the bot." },
      { name: "/repeat <times> <message>", desc: "Send a message N times." },
      { name: "/announce #channel <message>", desc: "Send an embed announcement." },
      { name: "/snipe", desc: "Show the last deleted message." },
    ],
  },
  {
    id: "engagement", label: "Polls, Reactions & Triggers", emoji: "📊",
    blurb: "Polls, reaction roles, and auto-triggers.",
    commands: [
      { name: "!poll <dur> <question>", desc: "Yes/No poll that auto-closes with results." },
      { name: "!poll <dur> <q> | opt1 | opt2", desc: "Multi-option poll (max 10 options)." },
      { name: "!rr create <title> | <emoji> @role | ...", desc: "Create a reaction role embed." },
      { name: "!rr add <msg_id> <emoji> @role", desc: "Add a reaction role to a message." },
      { name: "!rr remove <msg_id> <emoji>", desc: "Remove a reaction role." },
      { name: "!rr list / clear <msg_id>", desc: "List or clear reaction roles." },
      { name: "!trigger add reply <kw> | <resp>", desc: "Auto-reply on keyword." },
      { name: "!trigger add react <kw> | <emoji>", desc: "Auto-react on keyword." },
      { name: "!trigger add exact reply <kw> | <resp>", desc: "Exact match trigger." },
      { name: "!trigger list / remove <id> / clear", desc: "Manage triggers." },
    ],
    slash: [
      { name: "/poll <duration> <question> [options]", desc: "Create a poll (Yes/No or multi-option)." },
      { name: "/reactionrole create <title>", desc: "Create a reaction role panel." },
      { name: "/reactionrole add <msg_id> <emoji> @role", desc: "Add a reaction role." },
      { name: "/reactionrole remove <msg_id> <emoji>", desc: "Remove a reaction role." },
      { name: "/reactionrole list / clear", desc: "List or clear reaction roles." },
      { name: "/trigger add <type> <keyword> <response>", desc: "Add an auto-trigger." },
      { name: "/trigger list / remove <id> / clear", desc: "Manage triggers." },
    ],
  },
  {
    id: "tickets", label: "Tickets", emoji: "🎫",
    blurb: "Private ticket channels with transcripts. Users can attach an image link when opening a ticket!",
    commands: [
      { name: "!ticket setup [@support-role]", desc: "Post the Open Ticket button panel." },
      { name: "!ticket category <id>", desc: "Set the category for new tickets." },
      { name: "!ticket logs #channel", desc: "Set channel for ticket transcripts." },
      { name: "!ticket add @user", desc: "Add a user to the current ticket." },
      { name: "!ticket remove @user", desc: "Remove a user from the current ticket." },
      { name: "!ticket close", desc: "Close the current ticket." },
    ],
    slash: [
      { name: "/ticket setup [@support_role]", desc: "Post the Open Ticket button panel." },
      { name: "/ticket category <id>", desc: "Set the category for new tickets." },
      { name: "/ticket logs #channel", desc: "Set channel for ticket transcripts." },
      { name: "/ticket add @user", desc: "Add a user to the current ticket." },
      { name: "/ticket remove @user", desc: "Remove a user from the current ticket." },
      { name: "/ticket close", desc: "Close the current ticket." },
    ],
  },
  {
    id: "leaderboard", label: "Leaderboard", emoji: "📈",
    blurb: "Chat and voice activity tracking.",
    commands: [
      { name: "!lb [chat|vc] [period]", desc: "Interactive leaderboard with Chat/VC and period tabs." },
      { name: "!rank [@user]", desc: "View your or another user's rank & stats." },
      { name: "!lbreset daily|weekly|monthly|all", desc: "Reset leaderboard stats for a period." },
      { name: "!setlb #channel [vc|chat] [period]", desc: "Set a live auto-updating leaderboard channel." },
    ],
    slash: [
      { name: "/leaderboard [type] [period]", desc: "View chat or voice leaderboard." },
      { name: "/rank [@user]", desc: "View rank & stats for yourself or another user." },
      { name: "/lbreset <period>", desc: "Reset leaderboard stats." },
      { name: "/setlb #channel [type] [period]", desc: "Set a live leaderboard channel." },
    ],
  },
  {
    id: "utility", label: "Utility", emoji: "🔍",
    blurb: "Server and user info commands.",
    commands: [
      { name: "!userinfo [@user]", desc: "View detailed info about a user. Alias: `!whois`" },
      { name: "!serverinfo", desc: "View info about this server." },
      { name: "!avatar [@user]", desc: "Get a user's avatar. Alias: `!av`" },
      { name: "!servericon", desc: "Show the server icon." },
      { name: "!banner [@user]", desc: "Show the server or user banner." },
      { name: "!roleinfo @role", desc: "Detailed role info. Alias: `!ri`" },
      { name: "!channelinfo [#channel]", desc: "Channel info. Alias: `!ci`" },
      { name: "!inviteinfo <code>", desc: "Look up an invite by code or URL." },
      { name: "!invites [@user]", desc: "Show invite count for a user." },
      { name: "!permissions [@user]", desc: "List a user's permissions. Alias: `!perms`" },
      { name: "!inrole @role", desc: "List members who have a role." },
      { name: "!boosters", desc: "List all server boosters." },
      { name: "!firstmsg", desc: "Jump link to the first message in the channel." },
      { name: "!roleicon @role [emoji]", desc: "Set a role's icon emoji, or omit to remove. *(Level 2)*" },
      { name: "!role @user @role", desc: "Toggle a role on a user." },
      { name: "!nick @user <name|reset>", desc: "Change a user's nickname." },
      { name: "!ping", desc: "Show bot and API latency." },
      { name: "!members", desc: "Show total / human / bot / online member counts." },
      { name: "!botinfo", desc: "Show bot stats, uptime, and server count." },
      { name: "!afk [status]", desc: "Set AFK status. Send any message to return." },
      { name: "!hide [#channel]", desc: "Hide this channel from @everyone." },
      { name: "!unhide [#channel]", desc: "Make a hidden channel visible again." },
      { name: "!steal <emoji> [name]", desc: "Clone a custom emoji into this server." },
      { name: "!emoji <emoji>", desc: "Show info about a custom emoji." },
      { name: "!color <hex>", desc: "Preview a hex color with RGB breakdown." },
      { name: "!calc <expression>", desc: "Calculate a math expression." },
    ],
    slash: [
      { name: "/userinfo [@user]", desc: "View detailed user info." },
      { name: "/serverinfo", desc: "View server info." },
      { name: "/avatar [@user]", desc: "Get a user's avatar." },
      { name: "/servericon", desc: "Show the server icon." },
      { name: "/banner [@user]", desc: "Show server or user banner." },
      { name: "/roleinfo @role", desc: "Detailed role info." },
      { name: "/channelinfo [#channel]", desc: "Channel info." },
      { name: "/inviteinfo <code>", desc: "Look up an invite." },
      { name: "/invites [@user]", desc: "Invite count for a user." },
      { name: "/permissions [@user]", desc: "List a user's permissions." },
      { name: "/inrole @role", desc: "List members with a role." },
      { name: "/boosters", desc: "List all server boosters." },
      { name: "/firstmsg", desc: "Jump to the first message in this channel." },
      { name: "/roleicon @role [emoji]", desc: "Set or remove a role's icon emoji." },
      { name: "/role @user @role", desc: "Toggle a role on a user." },
      { name: "/nick @user <name>", desc: "Change a user's nickname." },
      { name: "/info ping", desc: "Show bot and API latency." },
      { name: "/info bot", desc: "Show bot stats and uptime." },
      { name: "/info members", desc: "Show server member counts." },
      { name: "/afk [status]", desc: "Set AFK status." },
      { name: "/hide / /unhide", desc: "Hide or show a channel." },
      { name: "/steal <emoji> [name]", desc: "Clone a custom emoji." },
      { name: "/emoji <emoji>", desc: "Show info about a custom emoji." },
      { name: "/color <hex>", desc: "Preview a hex color." },
      { name: "/calc <expression>", desc: "Calculate a math expression." },
      { name: "/link", desc: "Get the bot's invite link." },
    ],
  },
  {
    id: "fun", label: "Fun & Games", emoji: "🎮",
    blurb: "Games, fun commands, and text tools — all available as slash commands!",
    commands: [
      { name: "!8ball <question>", desc: "Ask the magic 8-ball." },
      { name: "!coinflip", desc: "Flip a coin. Alias: `!cf`" },
      { name: "!dice [sides]", desc: "Roll a dice. Default: d6." },
      { name: "!choose opt1, opt2", desc: "Pick a random option." },
      { name: "!color <hex>", desc: "Preview a hex color." },
      { name: "!remind <dur> <msg>", desc: "Set a reminder." },
      { name: "!calc <expression>", desc: "Calculate a math expression." },
      { name: "!wordbomb / !wb", desc: "Start a Word Bomb game!" },
      { name: "!wbstop", desc: "Stop the Word Bomb game." },
      { name: "!wbtop", desc: "Word Bomb leaderboard." },
      { name: "!rps <rock|paper|scissors>", desc: "Rock Paper Scissors vs bot." },
      { name: "!slots", desc: "Spin the slot machine! 🎰" },
      { name: "!trivia", desc: "Answer a trivia question." },
      { name: "!guess [max]", desc: "Guess the number game." },
    ],
    slash: [
      { name: "/fun joke", desc: "Get a random joke." },
      { name: "/fun dadjoke", desc: "Get a random dad joke." },
      { name: "/fun fact", desc: "Get a random interesting fact." },
      { name: "/fun quote", desc: "Get an inspirational quote." },
      { name: "/fun topic", desc: "Get a random conversation starter." },
      { name: "/fun roast [@user]", desc: "Roast someone (or yourself) 🔥" },
      { name: "/fun compliment [@user]", desc: "Give someone a compliment 💝" },
      { name: "/fun ship @user1 @user2", desc: "Check compatibility 💘" },
      { name: "/fun rate <thing>", desc: "Rate anything out of 10 ⭐" },
      { name: "/gen password [length]", desc: "Generate a secure password 🔑" },
      { name: "/gen number [min] [max]", desc: "Random number in a range 🎲" },
      { name: "/gen percent", desc: "Random percentage 🎯" },
      { name: "/gen yesno", desc: "Random Yes or No answer" },
      { name: "/8ball <question>", desc: "Ask the magic 8-ball." },
      { name: "/coinflip", desc: "Flip a coin." },
      { name: "/dice [sides]", desc: "Roll a dice." },
      { name: "/choose <options>", desc: "Pick a random option." },
      { name: "/remind <duration> <message>", desc: "Set a reminder." },
      { name: "/rps <choice>", desc: "Rock Paper Scissors vs bot." },
      { name: "/slots", desc: "Spin the slot machine 🎰" },
      { name: "/trivia", desc: "Trivia question (30s timer)." },
      { name: "/guess [max]", desc: "Number guessing game." },
      { name: "/wordbomb start / stop / top", desc: "Word Bomb mini-game." },
    ],
  },
  {
    id: "texttools", label: "Text Tools", emoji: "✍️",
    blurb: "Transform and encode text — all available via `/textify`.",
    commands: [
      { name: "!reverse <text>", desc: "Reverse text." },
      { name: "!mock <text>", desc: "SpOnGeBoB mOcKiNg TeXt." },
      { name: "!clap <text>", desc: "Add 👏 between words." },
      { name: "!upper <text>", desc: "UPPERCASE text." },
      { name: "!lower <text>", desc: "lowercase text." },
      { name: "!emojify <text>", desc: "Convert letters to regional indicator emoji." },
      { name: "!binary <text>", desc: "Convert text to binary." },
      { name: "!morse <text>", desc: "Convert text to Morse code." },
      { name: "!base64 encode/decode <text>", desc: "Base64 encode/decode. Alias: `!b64`" },
      { name: "!length <text>", desc: "Count characters, words, lines. Alias: `!len`" },
      { name: "!temp <value> <c|f|k>", desc: "Temperature conversion." },
    ],
    slash: [
      { name: "/textify reverse <text>", desc: "Reverse text." },
      { name: "/textify mock <text>", desc: "SpOnGeBoB mOcKiNg TeXt." },
      { name: "/textify clap <text>", desc: "Add 👏 between words." },
      { name: "/textify upper <text>", desc: "UPPERCASE text." },
      { name: "/textify lower <text>", desc: "lowercase text." },
      { name: "/textify emojify <text>", desc: "Letter emoji 🇦🇧🇨" },
      { name: "/textify binary <text>", desc: "Convert to binary." },
      { name: "/textify morse <text>", desc: "Convert to Morse code." },
      { name: "/textify base64 <mode> <text>", desc: "Base64 encode or decode." },
      { name: "/textify length <text>", desc: "Count chars, words, lines." },
      { name: "/convert temp <value> <unit>", desc: "Temperature conversion (°C/°F/K)." },
      { name: "/lookup urban <term>", desc: "Look up on Urban Dictionary." },
      { name: "/lookup wiki <topic>", desc: "Get a Wikipedia summary." },
    ],
  },
  {
    id: "social", label: "Social & Reactions", emoji: "💞",
    blurb: "Anime reaction GIFs with random phrases — all via `/social <action> @user`!",
    commands: [
      { name: "!hug @user", desc: "Hug someone 🤗" },
      { name: "!pat @user", desc: "Pat someone ✋" },
      { name: "!kiss @user", desc: "Kiss someone 💋" },
      { name: "!slap @user", desc: "Slap someone 👋" },
      { name: "!poke @user", desc: "Poke someone 👉" },
      { name: "!cuddle @user", desc: "Cuddle someone 🥰" },
      { name: "!bite @user", desc: "Bite someone 😬" },
      { name: "!bonk @user", desc: "Bonk someone 🔨" },
      { name: "!kill @user", desc: "Eliminate someone ☠️" },
      { name: "!highfive @user", desc: "High five ✋ Alias: `!hf`" },
      { name: "!wave [@user]", desc: "Wave 👋" },
      { name: "!cry", desc: "Cry 😢" },
      { name: "!roast @user", desc: "Roast someone 🔥" },
      { name: "!compliment @user", desc: "Give someone a compliment 💝" },
      { name: "!ship @user1 @user2", desc: "Check compatibility 💘" },
      { name: "!rate <thing>", desc: "Rate something out of 10 ⭐" },
      { name: "!topic", desc: "Get a random conversation starter." },
    ],
    slash: [
      { name: "/social hug @user", desc: "Hug someone 🤗" },
      { name: "/social kiss @user", desc: "Kiss someone 💋" },
      { name: "/social slap @user", desc: "Slap someone 👋" },
      { name: "/social pat @user", desc: "Pat someone ✋" },
      { name: "/social poke @user", desc: "Poke someone 👉" },
      { name: "/social cuddle @user", desc: "Cuddle someone 🥰" },
      { name: "/social bite @user", desc: "Bite someone 😬" },
      { name: "/social bonk @user", desc: "Bonk someone 🔨" },
      { name: "/social kill @user", desc: "Eliminate someone ☠️" },
      { name: "/social wave [@user]", desc: "Wave 👋" },
      { name: "/social cry", desc: "Cry 😢" },
      { name: "/social highfive @user", desc: "High five ✋" },
      { name: "/social boop @user", desc: "Boop on the nose 👆" },
      { name: "/social lick @user", desc: "Lick someone 👅" },
      { name: "/social nuzzle @user", desc: "Nuzzle someone 🐾" },
      { name: "/social dance", desc: "Do a little dance 💃" },
      { name: "/social stare [@user]", desc: "Stare at someone 👀" },
      { name: "/social tickle @user", desc: "Tickle someone 🤭" },
      { name: "/social wink [@user]", desc: "Wink at someone 😉" },
      { name: "/social blush", desc: "Blush shyly 😳" },
      { name: "/social yeet @user", desc: "Yeet someone 🌀" },
      { name: "/social nom @user", desc: "Nom nom nom 😋" },
      { name: "/social throw @user", desc: "Throw something 🎯" },
      { name: "/social smile", desc: "Flash a smile 😊" },
      { name: "/social happy", desc: "Show happiness 🎉" },
    ],
  },
  {
    id: "animals", label: "Animals", emoji: "🐾",
    blurb: "Cute random animal images!",
    commands: [
      { name: "!cat", desc: "Get a random cat photo 🐱" },
      { name: "!dog", desc: "Get a random dog photo 🐶" },
      { name: "!fox", desc: "Get a random fox photo 🦊" },
      { name: "!duck", desc: "Get a random duck photo 🦆" },
    ],
    slash: [
      { name: "/animal cat", desc: "Get a random cat image 🐱" },
      { name: "/animal dog", desc: "Get a random dog image 🐶" },
      { name: "/animal fox", desc: "Get a random fox image 🦊" },
      { name: "/animal duck", desc: "Get a random duck image 🦆" },
    ],
  },
];

const TOTAL_PREFIX = CATEGORIES.reduce((sum, c) => sum + c.commands.length, 0);
const TOTAL_SLASH = CATEGORIES.reduce((sum, c) => sum + c.slash.length, 0);

export function buildOverviewEmbed(): EmbedBuilder {
  const lines = CATEGORIES.map(
    (c) => `${c.emoji} **${c.label}** — ${c.commands.length + c.slash.length} commands`
  );
  return new EmbedBuilder()
    .setColor(C)
    .setTitle("📖 Help — All Commands")
    .setDescription(
      `**${TOTAL_PREFIX}** prefix commands · **${TOTAL_SLASH}** slash commands · **${CATEGORIES.length}** categories\n` +
      `Use \`/help\` or \`!help\` and pick a category below.\n\n` +
      lines.join("\n") +
      `\n\n[**Invite Bot**](${BOT_INVITE}) · \`/link\` for the invite link`
    );
}

export function buildCategoryEmbed(cat: Category): EmbedBuilder {
  const prefixLines = cat.commands.map((c) => `\`${c.name}\` — ${c.desc}`);
  const slashLines = cat.slash.map((c) => `\`${c.name}\` — ${c.desc}`);

  const embed = new EmbedBuilder()
    .setColor(C)
    .setTitle(`${cat.emoji} ${cat.label} — Commands`)
    .setDescription(`*${cat.blurb}*`);

  if (prefixLines.length > 0) {
    const chunks: string[] = [];
    let current = "";
    for (const line of prefixLines) {
      if ((current + "\n" + line).length > 1000) { chunks.push(current); current = line; }
      else current = current ? current + "\n" + line : line;
    }
    if (current) chunks.push(current);
    chunks.forEach((chunk, i) =>
      embed.addFields({ name: i === 0 ? "⌨️ Prefix Commands" : "⌨️ Prefix Commands (cont.)", value: chunk })
    );
  }

  if (slashLines.length > 0) {
    const chunks: string[] = [];
    let current = "";
    for (const line of slashLines) {
      if ((current + "\n" + line).length > 1000) { chunks.push(current); current = line; }
      else current = current ? current + "\n" + line : line;
    }
    if (current) chunks.push(current);
    chunks.forEach((chunk, i) =>
      embed.addFields({ name: i === 0 ? "✨ Slash Commands" : "✨ Slash Commands (cont.)", value: chunk })
    );
  }

  return embed;
}

export function buildMenu(selectedId?: string): ActionRowBuilder<StringSelectMenuBuilder> {
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("help_cat")
      .setPlaceholder("Browse a category...")
      .addOptions(
        CATEGORIES.map((c) => ({
          label: c.label,
          value: c.id,
          description: `${c.commands.length + c.slash.length} commands`,
          emoji: c.emoji,
          default: c.id === selectedId,
        }))
      )
  );
}

export async function handleHelp(message: Message): Promise<void> {
  let selected: string | undefined;

  const helpMsg = await message.reply({
    embeds: [buildOverviewEmbed()],
    components: [buildMenu()],
  });

  const collector = helpMsg.createMessageComponentCollector({
    componentType: ComponentType.StringSelect,
    time: TIMEOUT,
    filter: (i) => i.user.id === message.author.id,
  });

  collector.on("collect", async (i) => {
    selected = i.values[0];
    const cat = CATEGORIES.find((c) => c.id === selected);
    if (!cat) return;
    await i.update({ embeds: [buildCategoryEmbed(cat)], components: [buildMenu(selected)] });
  });

  collector.on("end", async () => {
    const disabled = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("help_cat_disabled")
        .setPlaceholder("Browse a category...")
        .setDisabled(true)
        .addOptions([{ label: "Expired", value: "none" }])
    );
    await helpMsg.edit({ components: [disabled] }).catch(() => {});
  });
}

export async function handleHelpInteraction(interaction: ChatInputCommandInteraction): Promise<void> {
  const categoryId = interaction.options.getString("category");
  const cat = categoryId ? CATEGORIES.find((c) => c.id === categoryId) : undefined;

  const embed = cat ? buildCategoryEmbed(cat) : buildOverviewEmbed();

  const helpMsg = await interaction.reply({
    embeds: [embed],
    components: [buildMenu(categoryId ?? undefined)],
    fetchReply: true,
  });

  const collector = helpMsg.createMessageComponentCollector({
    componentType: ComponentType.StringSelect,
    time: TIMEOUT,
    filter: (i) => i.user.id === interaction.user.id,
  });

  collector.on("collect", async (i) => {
    const selected = i.values[0];
    const selected_cat = CATEGORIES.find((c) => c.id === selected);
    if (!selected_cat) return;
    await i.update({ embeds: [buildCategoryEmbed(selected_cat)], components: [buildMenu(selected)] });
  });

  collector.on("end", async () => {
    const disabled = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("help_cat_disabled")
        .setPlaceholder("Browse a category...")
        .setDisabled(true)
        .addOptions([{ label: "Expired", value: "none" }])
    );
    await helpMsg.edit({ components: [disabled] }).catch(() => {});
  });
}
