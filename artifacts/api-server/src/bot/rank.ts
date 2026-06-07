import { EmbedBuilder, type Message } from "discord.js";
import { stats, type Period } from "./leaderboard";

function fmt(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const m = Math.floor(totalSec / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem > 0 ? `${h}h ${rem}m` : `${h}h`;
}

function fmtN(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export async function handleRank(message: Message): Promise<void> {
  if (!message.guild) return;

  const args = message.content.trim().split(/\s+/);
  const target =
    message.mentions.members?.first() ??
    (args[1] ? message.guild.members.cache.get(args[1]) : null) ??
    message.guild.members.cache.get(message.author.id)!;

  if (!target) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription("❌ Could not find that member.")] });
    return;
  }

  const guildId = message.guild.id;
  const userId = target.id;

  const guildData = stats.get(guildId);
  const userStats = guildData?.users.get(userId) ?? {
    messages: { daily: 0, weekly: 0, monthly: 0, lifetime: 0 } as Record<Period, number>,
    voiceMs:  { daily: 0, weekly: 0, monthly: 0, lifetime: 0 } as Record<Period, number>,
  };

  function rankOf(field: "messages" | "voiceMs"): number {
    if (!guildData) return 1;
    const myVal = userStats[field].lifetime;
    let rank = 1;
    for (const [uid, u] of guildData.users) {
      if (uid !== userId && u[field].lifetime > myVal) rank++;
    }
    return rank;
  }

  const chatRank = rankOf("messages");
  const vcRank   = rankOf("voiceMs");

  const periods: Period[] = ["daily", "weekly", "monthly", "lifetime"];
  const labels            = ["Today", "Week ", "Month", "All  "];

  const msgVals  = periods.map((p) => fmtN(userStats.messages[p]).padStart(5));
  const vcVals   = periods.map((p) => fmt(userStats.voiceMs[p]).padStart(5));
  const colHead  = labels.join("  ");
  const msgRow   = msgVals.join("  ");
  const vcRow    = vcVals.join("  ");

  const embed = new EmbedBuilder()
    .setColor(0xff0000)
    .setAuthor({
      name: `${target.displayName}'s Stats`,
      iconURL: target.user.displayAvatarURL({ size: 64 }),
    })
    .addFields(
      {
        name: "🏅 Rankings",
        value:
          `💬 Chat Rank: **#${chatRank}** (${fmtN(userStats.messages.lifetime)} msgs)\n` +
          `🎙️ VC Rank: **#${vcRank}** (${fmt(userStats.voiceMs.lifetime)})`,
        inline: false,
      },
      {
        name: "💬 Chat",
        value: `\`\`\`\n${colHead}\n${msgRow}\n\`\`\``,
        inline: false,
      },
      {
        name: "🎙️ Voice",
        value: `\`\`\`\n${colHead}\n${vcRow}\n\`\`\``,
        inline: false,
      },
    )
    .setFooter({ text: message.guild.name })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}
