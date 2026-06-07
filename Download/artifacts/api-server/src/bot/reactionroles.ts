import {
  EmbedBuilder,
  PermissionFlagsBits,
  type Message,
  type MessageReaction,
  type User,
  type TextChannel,
} from "discord.js";
import { db } from "@workspace/db";
import { reactionRolesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

interface ReactionRole {
  guildId: string;
  channelId: string;
  messageId: string;
  emoji: string;
  roleId: string;
}

const rrStore = new Map<string, ReactionRole>();

function makeKey(messageId: string, emoji: string): string { return `${messageId}:${emoji}`; }

export function normalizeEmoji(emoji: string): string {
  return emoji.trim().replace(/<a?:(\w+):(\d+)>/, "$1:$2");
}

function emojiMatches(stored: string, reactionEmoji: string): boolean {
  const norm = normalizeEmoji(reactionEmoji);
  return stored === norm || stored === reactionEmoji;
}

export async function initReactionRoles(): Promise<void> {
  const rows = await db.select().from(reactionRolesTable);
  for (const row of rows) {
    rrStore.set(makeKey(row.messageId, row.emoji), { guildId: row.guildId, channelId: row.channelId, messageId: row.messageId, emoji: row.emoji, roleId: row.roleId });
  }
}

export function getAllRR(guildId: string): ReactionRole[] {
  return [...rrStore.values()].filter((r) => r.guildId === guildId);
}

export async function addRREntry(rr: ReactionRole): Promise<void> {
  rrStore.set(makeKey(rr.messageId, rr.emoji), rr);
  await db.insert(reactionRolesTable)
    .values(rr)
    .onConflictDoUpdate({ target: [reactionRolesTable.messageId, reactionRolesTable.emoji], set: { roleId: rr.roleId, channelId: rr.channelId } });
}

export async function removeRREntry(messageId: string, emoji: string): Promise<boolean> {
  const key = makeKey(messageId, emoji);
  if (!rrStore.has(key)) return false;
  rrStore.delete(key);
  await db.delete(reactionRolesTable).where(and(eq(reactionRolesTable.messageId, messageId), eq(reactionRolesTable.emoji, emoji)));
  return true;
}

export async function clearRREntries(messageId: string): Promise<number> {
  let count = 0;
  for (const [key, rr] of rrStore.entries()) {
    if (rr.messageId === messageId) { rrStore.delete(key); count++; }
  }
  await db.delete(reactionRolesTable).where(eq(reactionRolesTable.messageId, messageId));
  return count;
}

export async function handleReactionRoleAdd(reaction: MessageReaction, user: User): Promise<void> {
  if (user.bot) return;
  if (reaction.partial) await reaction.fetch().catch(() => {});
  if (reaction.message.partial) await reaction.message.fetch().catch(() => {});
  const guild = reaction.message.guild;
  if (!guild) return;
  const emojiStr = reaction.emoji.id ? `${reaction.emoji.name}:${reaction.emoji.id}` : reaction.emoji.name ?? "";
  for (const rr of rrStore.values()) {
    if (rr.messageId === reaction.message.id && emojiMatches(rr.emoji, emojiStr)) {
      try { const member = await guild.members.fetch(user.id); await member.roles.add(rr.roleId); } catch { /* no perms */ }
    }
  }
}

export async function handleReactionRoleRemove(reaction: MessageReaction, user: User): Promise<void> {
  if (user.bot) return;
  if (reaction.partial) await reaction.fetch().catch(() => {});
  if (reaction.message.partial) await reaction.message.fetch().catch(() => {});
  const guild = reaction.message.guild;
  if (!guild) return;
  const emojiStr = reaction.emoji.id ? `${reaction.emoji.name}:${reaction.emoji.id}` : reaction.emoji.name ?? "";
  for (const rr of rrStore.values()) {
    if (rr.messageId === reaction.message.id && emojiMatches(rr.emoji, emojiStr)) {
      try { const member = await guild.members.fetch(user.id); await member.roles.remove(rr.roleId); } catch { /* no perms */ }
    }
  }
}

export async function handleRR(message: Message): Promise<void> {
  if (!message.guild) return;
  const mod = message.guild.members.cache.get(message.author.id);
  if (!mod?.permissions.has(PermissionFlagsBits.ManageRoles)) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription("❌ You need **Manage Roles** permission.")] });
    return;
  }
  const args = message.content.trim().split(/\s+/).slice(1);
  const sub = args[0]?.toLowerCase();

  if (!sub || sub === "help") {
    await message.reply({
      embeds: [
        new EmbedBuilder().setColor(0xff0000).setTitle("🎭 Reaction Roles")
          .addFields(
            { name: "`!rr add <message_id> <emoji> @role`", value: "Add a reaction role." },
            { name: "`!rr remove <message_id> <emoji>`", value: "Remove a reaction role." },
            { name: "`!rr list`", value: "List all reaction roles." },
            { name: "`!rr create <title> | emoji @role desc | ...`", value: "Create a reaction role embed." },
            { name: "`!rr clear <message_id>`", value: "Remove all reaction roles from a message." },
          ).setFooter({ text: "React to get the role. Unreact to remove it." }),
      ],
    });
    return;
  }

  if (sub === "list") {
    const all = getAllRR(message.guild.id);
    if (all.length === 0) { await message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription("No reaction roles set up.")] }); return; }
    const lines = all.map((rr) => `<#${rr.channelId}> \`${rr.messageId}\` ${rr.emoji} → <@&${rr.roleId}>`).join("\n");
    await message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setTitle("🎭 Reaction Roles").setDescription(lines).setFooter({ text: `${all.length} reaction role(s)` })] });
    return;
  }

  if (sub === "add") {
    const msgId = args[1];
    const emojiRaw = args[2];
    const role = message.mentions.roles.first();
    if (!msgId || !emojiRaw || !role) { await message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription("❌ Usage: `!rr add <message_id> <emoji> @role`")] }); return; }
    const emoji = normalizeEmoji(emojiRaw);
    if (rrStore.has(makeKey(msgId, emoji))) { await message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription("❌ A reaction role with that emoji already exists on that message.")] }); return; }
    try {
      const ch = message.channel as TextChannel;
      const msg = await ch.messages.fetch(msgId);
      await msg.react(emojiRaw);
      await addRREntry({ guildId: message.guild.id, channelId: message.channelId, messageId: msgId, emoji, roleId: role.id });
      await message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription(`✅ Added reaction role: ${emojiRaw} → <@&${role.id}> on message \`${msgId}\`.`)] });
    } catch {
      await message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription("❌ Could not find that message or I can't use that emoji.")] });
    }
    return;
  }

  if (sub === "remove") {
    const msgId = args[1];
    const emojiRaw = args[2];
    if (!msgId || !emojiRaw) { await message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription("❌ Usage: `!rr remove <message_id> <emoji>`")] }); return; }
    const emoji = normalizeEmoji(emojiRaw);
    const found = await removeRREntry(msgId, emoji);
    if (!found) { await message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription("❌ No reaction role found.")] }); return; }
    await message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription(`✅ Removed reaction role ${emojiRaw} from message \`${msgId}\`.`)] });
    return;
  }

  if (sub === "clear") {
    const msgId = args[1];
    if (!msgId) { await message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription("❌ Usage: `!rr clear <message_id>`")] }); return; }
    const count = await clearRREntries(msgId);
    await message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription(`✅ Removed **${count}** reaction role(s) from message \`${msgId}\`.`)] });
    return;
  }

  if (sub === "create") {
    const raw = message.content.trim().replace(/^!rr\s+create\s+/i, "");
    const parts = raw.split("|").map((p) => p.trim()).filter(Boolean);
    if (parts.length < 2) {
      await message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription("❌ Usage: `!rr create <title> | <emoji> @role desc | ...`")] });
      return;
    }
    const title = parts[0];
    const rows: { emoji: string; roleId: string; label: string }[] = [];
    for (const part of parts.slice(1)) {
      const words = part.split(/\s+/);
      const emojiRaw = words[0];
      const roleMention = words.find((w) => w.match(/^<@&\d+>$/));
      if (!roleMention) continue;
      const roleId = roleMention.replace(/[^0-9]/g, "");
      const label = words.filter((w) => !w.match(/^<@&\d+>$/) && w !== emojiRaw).join(" ") || "";
      rows.push({ emoji: normalizeEmoji(emojiRaw), label, roleId });
    }
    if (rows.length === 0) { await message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription("❌ No valid emoji + role pairs found.")] }); return; }
    const desc = rows.map((r) => `${r.emoji} — <@&${r.roleId}>${r.label ? ` — ${r.label}` : ""}`).join("\n");
    const rrMsg = await (message.channel as TextChannel).send({
      embeds: [new EmbedBuilder().setColor(0xff0000).setTitle(`🎭 ${title}`).setDescription(desc + "\n\n*React below to get your role!*")],
    });
    for (const row of rows) {
      await addRREntry({ guildId: message.guild.id, channelId: message.channelId, messageId: rrMsg.id, emoji: row.emoji, roleId: row.roleId });
      await rrMsg.react(row.emoji.includes(":") ? `<:${row.emoji}>` : row.emoji).catch(() => {});
    }
    await message.delete().catch(() => {});
    return;
  }

  await message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription("❌ Unknown subcommand. Use `!rr help`.")] });
}
