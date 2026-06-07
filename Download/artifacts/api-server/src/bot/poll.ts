import {
  EmbedBuilder,
  PermissionFlagsBits,
  type Message,
  type TextChannel,
} from "discord.js";

const LETTER_EMOJIS = ["🇦", "🇧", "🇨", "🇩", "🇪", "🇫", "🇬", "🇭", "🇮", "🇯"];

function parseDuration(input: string): number | null {
  const match = input.match(/^(\d+)(s|m|h|d)$/i);
  if (!match) return null;
  const value = parseInt(match[1]);
  const unit = match[2].toLowerCase();
  const multipliers: Record<string, number> = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return value * multipliers[unit];
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export async function handlePoll(message: Message): Promise<void> {
  if (!message.guild) return;

  const args = message.content.trim().split(/\s+/).slice(1);

  const raw = message.content.trim().replace(/^!poll\s+/i, "");
  const parts = raw.split("|").map((p) => p.trim()).filter(Boolean);

  if (parts.length < 2) {
    await message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff0000)
          .setTitle("Command: !poll")
          .setDescription(
            "**Usage:** `!poll <duration> <question> | option1 | option2 | ...`\n\n" +
            "**Example:** `!poll 5m Which is better? | Discord | Slack | Teams`\n\n" +
            "For a yes/no poll: `!poll 10m Should we add a bot?`\n" +
            "**Durations:** `30s` `5m` `2h` `1d`"
          ),
      ],
    });
    return;
  }

  const firstPart = parts[0];
  const firstWords = firstPart.split(/\s+/);
  const duration = parseDuration(firstWords[0]);

  let question: string;
  let options: string[];
  let durationMs: number;

  if (duration) {
    durationMs = duration;
    question = firstWords.slice(1).join(" ") || parts[1];
    options = parts.length === 2 && firstWords.length > 1
      ? []
      : parts.slice(firstWords.length > 1 ? 1 : 2);
    if (firstWords.length === 1) {
      question = parts[1];
      options = parts.slice(2);
    }
  } else {
    durationMs = 5 * 60 * 1000;
    question = firstPart;
    options = parts.slice(1);
  }

  if (!question) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription("❌ Please provide a question.")] });
    return;
  }

  const isYesNo = options.length === 0;
  const voteEmojis = isYesNo ? ["👍", "👎"] : LETTER_EMOJIS.slice(0, Math.min(options.length, 10));

  if (!isYesNo && options.length > 10) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription("❌ Maximum 10 options allowed.")] });
    return;
  }

  const endsAt = Date.now() + durationMs;

  const optionLines = isYesNo
    ? `👍 Yes\n👎 No`
    : options.map((opt, i) => `${voteEmojis[i]} ${opt}`).join("\n");

  const pollEmbed = new EmbedBuilder()
    .setColor(0xff0000)
    .setTitle(`📊 ${question}`)
    .setDescription(optionLines)
    .addFields({ name: "Duration", value: formatDuration(durationMs), inline: true })
    .setFooter({ text: `Poll by ${message.author.username} • Ends` })
    .setTimestamp(endsAt);

  const pollMsg = await (message.channel as TextChannel).send({ embeds: [pollEmbed] });

  await message.delete().catch(() => {});

  for (const emoji of voteEmojis) {
    await pollMsg.react(emoji);
  }

  setTimeout(async () => {
    try {
      const fetched = await pollMsg.fetch();
      const results: { emoji: string; label: string; count: number }[] = [];

      if (isYesNo) {
        const yes = (fetched.reactions.cache.get("👍")?.count ?? 1) - 1;
        const no = (fetched.reactions.cache.get("👎")?.count ?? 1) - 1;
        results.push({ emoji: "👍", label: "Yes", count: yes });
        results.push({ emoji: "👎", label: "No", count: no });
      } else {
        for (let i = 0; i < options.length; i++) {
          const count = (fetched.reactions.cache.get(voteEmojis[i])?.count ?? 1) - 1;
          results.push({ emoji: voteEmojis[i], label: options[i], count });
        }
      }

      const total = results.reduce((a, b) => a + b.count, 0);
      const maxCount = Math.max(...results.map((r) => r.count));

      const resultLines = results
        .sort((a, b) => b.count - a.count)
        .map((r) => {
          const pct = total > 0 ? Math.round((r.count / total) * 100) : 0;
          const winner = r.count === maxCount && maxCount > 0 ? " 🏆" : "";
          const bar = "█".repeat(Math.round(pct / 10)) + "░".repeat(10 - Math.round(pct / 10));
          return `${r.emoji} **${r.label}**${winner}\n\`${bar}\` ${pct}% (${r.count} vote${r.count !== 1 ? "s" : ""})`;
        })
        .join("\n\n");

      await pollMsg.edit({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff0000)
            .setTitle(`📊 ${question} — Results`)
            .setDescription(resultLines || "No votes were cast.")
            .addFields({ name: "Total Votes", value: String(total), inline: true })
            .setFooter({ text: `Poll ended` })
            .setTimestamp(),
        ],
      });
    } catch {
      // Message deleted or unavailable
    }
  }, durationMs);
}
