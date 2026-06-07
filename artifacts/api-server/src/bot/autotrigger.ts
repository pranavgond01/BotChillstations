import { EmbedBuilder, PermissionFlagsBits, type Message } from "discord.js";
import { db } from "@workspace/db";
import { autoTriggersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

type TriggerType = "reply" | "react";

interface Trigger {
  id: string;
  guildId: string;
  keyword: string;
  type: TriggerType;
  value: string;
  exact: boolean;
}

const triggers = new Map<string, Trigger[]>();

function randomId(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function getGuildTriggers(guildId: string): Trigger[] {
  if (!triggers.has(guildId)) triggers.set(guildId, []);
  return triggers.get(guildId)!;
}

export async function initAutoTriggers(): Promise<void> {
  const rows = await db.select().from(autoTriggersTable);
  for (const row of rows) {
    const list = getGuildTriggers(row.guildId);
    list.push({ id: row.triggerId, guildId: row.guildId, keyword: row.keyword, type: row.type as TriggerType, value: row.value, exact: row.exact });
  }
}

export function getGuildTriggersFromCache(guildId: string): Trigger[] {
  return getGuildTriggers(guildId);
}

export async function addTriggerEntry(t: Trigger): Promise<void> {
  const list = getGuildTriggers(t.guildId);
  list.push(t);
  await db.insert(autoTriggersTable).values({ triggerId: t.id, guildId: t.guildId, keyword: t.keyword, type: t.type, value: t.value, exact: t.exact });
}

export async function removeTriggerEntry(guildId: string, triggerId: string): Promise<boolean> {
  const list = getGuildTriggers(guildId);
  const idx = list.findIndex((t) => t.id === triggerId);
  if (idx === -1) return false;
  list.splice(idx, 1);
  await db.delete(autoTriggersTable).where(and(eq(autoTriggersTable.guildId, guildId), eq(autoTriggersTable.triggerId, triggerId)));
  return true;
}

export async function clearTriggerEntries(guildId: string): Promise<void> {
  triggers.set(guildId, []);
  await db.delete(autoTriggersTable).where(eq(autoTriggersTable.guildId, guildId));
}

export async function processTriggers(message: Message): Promise<void> {
  if (!message.guild || message.author.bot) return;
  const list = getGuildTriggers(message.guild.id);
  const content = message.content.toLowerCase();
  for (const trigger of list) {
    const keyword = trigger.keyword.toLowerCase();
    const matches = trigger.exact ? content === keyword : content.includes(keyword);
    if (!matches) continue;
    if (trigger.type === "reply") await message.reply(trigger.value).catch(() => {});
    else if (trigger.type === "react") await message.react(trigger.value).catch(() => {});
  }
}

export async function handleTrigger(message: Message): Promise<void> {
  if (!message.guild) return;
  const mod = message.guild.members.cache.get(message.author.id);
  if (!mod?.permissions.has(PermissionFlagsBits.ManageGuild)) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription("❌ You need **Manage Server** permission.")] });
    return;
  }
  const raw = message.content.trim();
  const args = raw.split(/\s+/).slice(1);
  const sub = args[0]?.toLowerCase();

  if (!sub || sub === "help") {
    await message.reply({
      embeds: [
        new EmbedBuilder().setColor(0xff0000).setTitle("⚡ Auto Triggers")
          .addFields(
            { name: "`!trigger add reply <keyword> | <response>`", value: "Auto-reply when message contains keyword." },
            { name: "`!trigger add react <keyword> | <emoji>`", value: "Auto-react when message contains keyword." },
            { name: "`!trigger add exact reply <keyword> | <response>`", value: "Exact match trigger." },
            { name: "`!trigger list`", value: "List all triggers." },
            { name: "`!trigger remove <ID>`", value: "Remove trigger by ID." },
            { name: "`!trigger clear`", value: "Remove all triggers." },
          ).setFooter({ text: "Keywords are case-insensitive" }),
      ],
    });
    return;
  }

  if (sub === "list") {
    const list = getGuildTriggers(message.guild.id);
    if (list.length === 0) { await message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription("No triggers set up.")] }); return; }
    const lines = list.map((t) => `\`${t.id}\` **${t.type.toUpperCase()}** ${t.exact ? "(exact) " : ""}\`${t.keyword}\` → ${t.value}`).join("\n");
    await message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setTitle("⚡ Auto Triggers").setDescription(lines).setFooter({ text: `${list.length} trigger(s)` })] });
    return;
  }

  if (sub === "remove") {
    const id = args[1]?.toUpperCase();
    if (!id) { await message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription("❌ Usage: `!trigger remove <ID>`")] }); return; }
    const found = await removeTriggerEntry(message.guild.id, id);
    if (!found) { await message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription(`❌ No trigger found with ID \`${id}\`.`)] }); return; }
    await message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription(`✅ Trigger \`${id}\` removed.`)] });
    return;
  }

  if (sub === "clear") {
    await clearTriggerEntries(message.guild.id);
    await message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription("✅ All triggers cleared.")] });
    return;
  }

  if (sub === "add") {
    let exact = false;
    let typeRaw = args[1]?.toLowerCase();
    let rest = args.slice(2).join(" ");
    if (typeRaw === "exact") { exact = true; typeRaw = args[2]?.toLowerCase(); rest = args.slice(3).join(" "); }
    if (typeRaw !== "reply" && typeRaw !== "react") {
      await message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription("❌ Type must be `reply` or `react`.")] });
      return;
    }
    const parts = rest.split("|").map((p) => p.trim());
    if (parts.length < 2 || !parts[0] || !parts[1]) {
      await message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription("❌ Use `|` to separate keyword and value. Example: `!trigger add reply hello | Hi there!`")] });
      return;
    }
    const keyword = parts[0].toLowerCase();
    const value = parts[1];
    const list = getGuildTriggers(message.guild.id);
    if (list.length >= 25) { await message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription("❌ Maximum 25 triggers per server.")] }); return; }
    const id = randomId();
    await addTriggerEntry({ id, guildId: message.guild.id, keyword, type: typeRaw, value, exact });
    await message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription(`✅ Trigger added! \`ID: ${id}\`\n**Type:** ${typeRaw.toUpperCase()}${exact ? " (exact)" : ""}\n**Keyword:** \`${keyword}\`\n**Value:** ${value}`)] });
    return;
  }

  await message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription("❌ Unknown subcommand. Use `!trigger help`.")] });
}
