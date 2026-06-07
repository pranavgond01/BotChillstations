import {
  EmbedBuilder,
  PermissionFlagsBits,
  OverwriteType,
  type Message,
  type Client,
  type TextChannel,
  type GuildMember,
} from "discord.js";

const C = 0xff0000;

const EIGHT_BALL = [
  "🟢 It is certain.",
  "🟢 It is decidedly so.",
  "🟢 Without a doubt.",
  "🟢 Yes, definitely.",
  "🟢 You may rely on it.",
  "🟢 As I see it, yes.",
  "🟢 Most likely.",
  "🟢 Outlook good.",
  "🟢 Yes.",
  "🟢 Signs point to yes.",
  "🟡 Reply hazy, try again.",
  "🟡 Ask again later.",
  "🟡 Better not tell you now.",
  "🟡 Cannot predict now.",
  "🟡 Concentrate and ask again.",
  "🔴 Don't count on it.",
  "🔴 My reply is no.",
  "🔴 My sources say no.",
  "🔴 Outlook not so good.",
  "🔴 Very doubtful.",
];

const REMINDERS = new Map<string, ReturnType<typeof setTimeout>>();

export async function handlePing(client: Client, message: Message): Promise<void> {
  const sent = await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("🏓 Pinging...")] });
  const latency = sent.createdTimestamp - message.createdTimestamp;
  const wsLatency = client.ws.ping;
  await sent.edit({
    embeds: [
      new EmbedBuilder()
        .setColor(C)
        .setTitle("🏓 Pong!")
        .addFields(
          { name: "📨 Message Latency", value: `\`${latency}ms\``, inline: true },
          { name: "💓 API Latency", value: `\`${wsLatency}ms\``, inline: true },
        ),
    ],
  });
}

export async function handleEightBall(message: Message): Promise<void> {
  const question = message.content.trim().replace(/^!8ball\s*/i, "").trim();
  if (!question) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Usage: `!8ball <question>`")] });
    return;
  }
  const answer = EIGHT_BALL[Math.floor(Math.random() * EIGHT_BALL.length)];
  await message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(C)
        .setTitle("🎱 Magic 8-Ball")
        .addFields(
          { name: "❓ Question", value: question, inline: false },
          { name: "💬 Answer", value: answer, inline: false },
        ),
    ],
  });
}

export async function handleCoinflip(message: Message): Promise<void> {
  const result = Math.random() < 0.5 ? "🪙 Heads!" : "🪙 Tails!";
  await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(`**Coin Flip:** ${result}`)] });
}

export async function handleDice(message: Message): Promise<void> {
  const args = message.content.trim().split(/\s+/).slice(1);
  const sides = parseInt(args[0] ?? "6");
  if (isNaN(sides) || sides < 2 || sides > 1000) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Usage: `!dice [sides]` (2–1000, default 6)")] });
    return;
  }
  const roll = Math.floor(Math.random() * sides) + 1;
  await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(`🎲 You rolled a **d${sides}**: **${roll}**`)] });
}

export async function handleMembers(message: Message): Promise<void> {
  if (!message.guild) return;
  await message.guild.members.fetch().catch(() => {});
  const total = message.guild.memberCount;
  const humans = message.guild.members.cache.filter((m) => !m.user.bot).size;
  const bots = message.guild.members.cache.filter((m) => m.user.bot).size;
  const online = message.guild.members.cache.filter(
    (m) => m.presence?.status === "online" || m.presence?.status === "dnd" || m.presence?.status === "idle"
  ).size;

  await message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(C)
        .setTitle(`👥 ${message.guild.name} — Members`)
        .addFields(
          { name: "Total", value: `\`${total}\``, inline: true },
          { name: "Humans", value: `\`${humans}\``, inline: true },
          { name: "Bots", value: `\`${bots}\``, inline: true },
          { name: "Online", value: `\`${online}\``, inline: true },
        ),
    ],
  });
}

export async function handleBotInfo(client: Client, message: Message): Promise<void> {
  if (!message.guild) return;
  const guildCount = client.guilds.cache.size;
  const uptime = process.uptime();
  const h = Math.floor(uptime / 3600);
  const m = Math.floor((uptime % 3600) / 60);
  const s = Math.floor(uptime % 60);
  const uptimeStr = `${h}h ${m}m ${s}s`;

  await message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(C)
        .setTitle(`🤖 ${client.user?.username ?? "Bot"} Info`)
        .setThumbnail(client.user?.displayAvatarURL({ size: 256 }) ?? null)
        .addFields(
          { name: "Bot Tag", value: `\`${client.user?.tag}\``, inline: true },
          { name: "Servers", value: `\`${guildCount}\``, inline: true },
          { name: "Uptime", value: `\`${uptimeStr}\``, inline: true },
          { name: "Ping", value: `\`${client.ws.ping}ms\``, inline: true },
          { name: "Library", value: "`discord.js v14`", inline: true },
          { name: "Node.js", value: `\`${process.version}\``, inline: true },
        )
        .setFooter({ text: "Use !help to see all commands." })
        .setTimestamp(),
    ],
  });
}

function parseDur(input: string): number | null {
  const m = input.match(/^(\d+)(s|m|h|d)$/i);
  if (!m) return null;
  const v = parseInt(m[1]);
  const u = m[2].toLowerCase();
  return v * ({ s: 1000, m: 60000, h: 3600000, d: 86400000 } as Record<string, number>)[u];
}

export async function handleRemind(message: Message): Promise<void> {
  const args = message.content.trim().split(/\s+/).slice(1);
  if (args.length < 2) {
    await message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(C)
          .setDescription("❌ Usage: `!remind <duration> <message>`\n**Example:** `!remind 5m Take a break`\n**Durations:** `30s` `5m` `2h` `1d`"),
      ],
    });
    return;
  }
  const ms = parseDur(args[0]);
  if (!ms) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Invalid duration. Use `30s`, `5m`, `2h`, `1d`.")] });
    return;
  }
  if (ms > 7 * 24 * 60 * 60 * 1000) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Maximum reminder duration is 7 days.")] });
    return;
  }
  const note = args.slice(1).join(" ");
  const endAt = Date.now() + ms;

  await message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(C)
        .setDescription(`✅ Got it! I'll remind you about **${note}** <t:${Math.floor(endAt / 1000)}:R>.`),
    ],
  });

  const channelId = message.channelId;
  const userId = message.author.id;

  setTimeout(async () => {
    try {
      const ch = await message.client.channels.fetch(channelId) as TextChannel;
      await ch.send({
        content: `<@${userId}>`,
        embeds: [
          new EmbedBuilder()
            .setColor(C)
            .setTitle("⏰ Reminder!")
            .setDescription(note)
            .setFooter({ text: "You asked me to remind you." })
            .setTimestamp(),
        ],
      });
    } catch { /* Channel deleted */ }
  }, ms);
}

export async function handleColor(message: Message): Promise<void> {
  const args = message.content.trim().split(/\s+/).slice(1);
  const hex = args[0]?.replace("#", "");
  if (!hex || !/^[0-9a-fA-F]{6}$/.test(hex)) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Usage: `!color <hex>` e.g. `!color ff0000`")] });
    return;
  }
  const colorInt = parseInt(hex, 16);
  const r = (colorInt >> 16) & 255;
  const g = (colorInt >> 8) & 255;
  const b = colorInt & 255;
  await message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(colorInt)
        .setTitle(`🎨 Color #${hex.toUpperCase()}`)
        .addFields(
          { name: "Hex", value: `\`#${hex.toUpperCase()}\``, inline: true },
          { name: "RGB", value: `\`${r}, ${g}, ${b}\``, inline: true },
          { name: "Decimal", value: `\`${colorInt}\``, inline: true },
        )
        .setImage(`https://singlecolorimage.com/get/${hex}/200x80`),
    ],
  });
}

export async function handleChoose(message: Message): Promise<void> {
  const raw = message.content.trim().replace(/^!choose\s*/i, "");
  const options = raw.split(/[,|]/).map((o) => o.trim()).filter(Boolean);
  if (options.length < 2) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Usage: `!choose option1, option2, option3`\nor `!choose option1 | option2 | option3`")] });
    return;
  }
  const chosen = options[Math.floor(Math.random() * options.length)];
  await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(`🎯 I choose: **${chosen}**`)] });
}

export async function handleRepeat(message: Message): Promise<void> {
  if (!message.guild) return;
  const mod = message.guild.members.cache.get(message.author.id);
  if (!mod?.permissions.has(PermissionFlagsBits.ManageMessages)) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ You need **Manage Messages** permission.")] });
    return;
  }
  const args = message.content.trim().split(/\s+/).slice(1);
  const times = parseInt(args[0]);
  if (isNaN(times) || times < 1 || times > 10) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Usage: `!repeat <times 1-10> <message>`")] });
    return;
  }
  const text = args.slice(1).join(" ");
  if (!text) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Please provide a message to repeat.")] });
    return;
  }
  await message.delete().catch(() => {});
  for (let i = 0; i < times; i++) {
    await (message.channel as TextChannel).send(text);
  }
}

// ── !hide ──────────────────────────────────────────────────────────────────────
export async function handleHide(message: Message): Promise<void> {
  if (!message.guild) return;
  const member = message.guild.members.cache.get(message.author.id);
  if (!member?.permissions.has(PermissionFlagsBits.ManageChannels)) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ You need the **Manage Channels** permission.")] });
    return;
  }
  const targetChannel = (message.mentions.channels.first() ?? message.channel) as TextChannel;
  try {
    await targetChannel.permissionOverwrites.edit(message.guild.id, { ViewChannel: false });
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(`🙈 **#${targetChannel.name}** is now hidden from everyone. Use \`!unhide\` to restore.`)] });
  } catch {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Failed to hide channel. Check my permissions.")] });
  }
}

// ── !unhide ─────────────────────────────────────────────────────────────────────
export async function handleUnhide(message: Message): Promise<void> {
  if (!message.guild) return;
  const member = message.guild.members.cache.get(message.author.id);
  if (!member?.permissions.has(PermissionFlagsBits.ManageChannels)) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ You need the **Manage Channels** permission.")] });
    return;
  }
  const targetChannel = (message.mentions.channels.first() ?? message.channel) as TextChannel;
  try {
    await targetChannel.permissionOverwrites.edit(message.guild.id, { ViewChannel: null });
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(`👁️ **#${targetChannel.name}** is now visible to everyone again.`)] });
  } catch {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Failed to unhide channel. Check my permissions.")] });
  }
}

// ── !steal ─────────────────────────────────────────────────────────────────────
const CUSTOM_EMOJI_RE = /<(a?):(\w+):(\d+)>/;

export async function handleSteal(message: Message): Promise<void> {
  if (!message.guild) return;
  const member = message.guild.members.cache.get(message.author.id) as GuildMember;
  if (!member?.permissions.has(PermissionFlagsBits.ManageGuildExpressions)) {
    await message.reply("❌ You need the **Manage Expressions** permission.");
    return;
  }
  const args = message.content.trim().split(/\s+/).slice(1);
  const raw = args[0] ?? "";
  const match = CUSTOM_EMOJI_RE.exec(raw);
  if (!match) {
    await message.reply("❌ Usage: `!steal <custom_emoji> [newname]`\nOnly custom emojis (not Unicode) can be stolen.");
    return;
  }
  const [, animated, originalName, emojiId] = match;
  const newName = args[1] ?? originalName;
  const ext = animated === "a" ? "gif" : "png";
  const url = `https://cdn.discordapp.com/emojis/${emojiId}.${ext}`;
  try {
    const emoji = await message.guild.emojis.create({ attachment: url, name: newName });
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(`✅ Stolen! Added ${emoji} as \`${emoji.name}\` (ID: \`${emoji.id}\`).`)] });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await message.reply(`❌ Failed to add emoji: ${msg}`);
  }
}

// ── !emoji ─────────────────────────────────────────────────────────────────────
export async function handleEmoji(message: Message): Promise<void> {
  const args = message.content.trim().split(/\s+/).slice(1);
  const raw = args[0] ?? "";
  const match = CUSTOM_EMOJI_RE.exec(raw);
  if (!match) {
    await message.reply("❌ Usage: `!emoji <custom_emoji>`\nOnly custom emojis are supported (not Unicode).");
    return;
  }
  const [, animated, name, emojiId] = match;
  const ext = animated === "a" ? "gif" : "png";
  const url = `https://cdn.discordapp.com/emojis/${emojiId}.${ext}?size=256`;
  await message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(C)
        .setTitle(`${animated === "a" ? "Animated " : ""}Emoji — :${name}:`)
        .setThumbnail(url)
        .addFields(
          { name: "Name", value: `\`:${name}:\``, inline: true },
          { name: "ID", value: `\`${emojiId}\``, inline: true },
          { name: "Animated", value: animated === "a" ? "Yes" : "No", inline: true },
          { name: "URL", value: `[Download](${url})` },
        ),
    ],
  });
}
