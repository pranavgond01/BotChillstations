import {
  EmbedBuilder,
  PermissionFlagsBits,
  ActivityType,
  type Message,
  type GuildMember,
  type Presence,
  type Client,
} from "discord.js";
import { db } from "@workspace/db";
import { vanityRoleConfigsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

interface VanityConfig { roleId: string; code?: string; }

const configs = new Map<string, VanityConfig>();
const C = 0xff0000;

export async function initVanityRoles(): Promise<void> {
  const rows = await db.select().from(vanityRoleConfigsTable);
  for (const row of rows) configs.set(row.guildId, { roleId: row.roleId, code: row.code ?? undefined });
}

export function getVanityConfigFromCache(guildId: string): VanityConfig | undefined {
  return configs.get(guildId);
}

export async function setVanityRoleDb(guildId: string, config: VanityConfig): Promise<void> {
  configs.set(guildId, config);
  await db.insert(vanityRoleConfigsTable)
    .values({ guildId, roleId: config.roleId, code: config.code })
    .onConflictDoUpdate({ target: vanityRoleConfigsTable.guildId, set: { roleId: config.roleId, code: config.code } });
}

export async function deleteVanityRoleDb(guildId: string): Promise<void> {
  configs.delete(guildId);
  await db.delete(vanityRoleConfigsTable).where(eq(vanityRoleConfigsTable.guildId, guildId));
}

export function statusHasVanity(presence: Presence, code: string): boolean {
  const lower = code.toLowerCase();
  for (const activity of presence.activities) {
    if (activity.type === ActivityType.Custom && activity.state) {
      const state = activity.state.toLowerCase();
      if (state.includes(`discord.gg/${lower}`) || state.includes(`discord.com/invite/${lower}`) || state.includes(`.gg/${lower}`)) return true;
    }
  }
  return false;
}

export async function handlePresenceUpdate(_oldPresence: Presence | null, newPresence: Presence): Promise<void> {
  const guild = newPresence.guild;
  if (!guild) return;
  const config = configs.get(guild.id);
  if (!config) return;
  const member = newPresence.member;
  if (!member || member.user.bot) return;
  const code = config.code ?? guild.vanityURLCode;
  if (!code) return;
  try {
    const role = guild.roles.cache.get(config.roleId);
    if (!role) return;
    const hasRole = member.roles.cache.has(role.id);
    const hasVanity = statusHasVanity(newPresence, code);
    if (hasVanity && !hasRole) await member.roles.add(role, "Vanity URL in status");
    else if (!hasVanity && hasRole) await member.roles.remove(role, "Vanity URL no longer in status");
  } catch { /* permissions missing */ }
}

export async function handleVanityRole(client: Client, message: Message): Promise<void> {
  if (!message.guild) return;
  const mod = message.guild.members.cache.get(message.author.id);
  if (!mod?.permissions.has(PermissionFlagsBits.ManageGuild)) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ You need **Manage Server** permission.")] });
    return;
  }
  const args = message.content.trim().split(/\s+/).slice(1);
  const sub = args[0]?.toLowerCase();

  if (!sub) {
    const cur = configs.get(message.guild.id);
    const code = cur?.code ?? message.guild.vanityURLCode;
    await message.reply({
      embeds: [
        new EmbedBuilder().setColor(C).setTitle("💎 Vanity Role System")
          .setDescription(cur ? `**Role:** <@&${cur.roleId}>\n**Vanity Code:** \`${code ?? "not set"}\`` : "Not configured.")
          .addFields({ name: "Commands", value: "`!vanityrole set @role` `!vanityrole url <code>` `!vanityrole check` `!vanityrole disable`" }),
      ],
    });
    return;
  }

  if (sub === "disable") {
    await deleteVanityRoleDb(message.guild.id);
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("✅ Vanity role system **disabled**.")] });
    return;
  }

  if (sub === "set") {
    const role = message.mentions.roles.first();
    if (!role) { await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Usage: `!vanityrole set @role`")] }); return; }
    const existing = configs.get(message.guild.id);
    await setVanityRoleDb(message.guild.id, { roleId: role.id, code: existing?.code });
    const code = existing?.code ?? message.guild.vanityURLCode;
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(`✅ Vanity role set to <@&${role.id}>!\nScanning for: \`discord.gg/${code ?? "? — set with !vanityrole url <code>"}\``)] });
    return;
  }

  if (sub === "url") {
    const code = args[1]?.replace(/discord\.gg\//gi, "").replace(/discord\.com\/invite\//gi, "").trim();
    if (!code) { await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Usage: `!vanityrole url <vanity_code>`")] }); return; }
    const existing = configs.get(message.guild.id);
    await setVanityRoleDb(message.guild.id, { roleId: existing?.roleId ?? "", code });
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(`✅ Vanity code set to \`${code}\`.`)] });
    return;
  }

  if (sub === "check") {
    const config = configs.get(message.guild.id);
    if (!config?.roleId) { await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Set a role first with `!vanityrole set @role`.")] }); return; }
    const code = config.code ?? message.guild.vanityURLCode;
    if (!code) { await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ No vanity code. Set with `!vanityrole url <code>`.")] }); return; }
    const role = message.guild.roles.cache.get(config.roleId);
    if (!role) { await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Role not found.")] }); return; }
    const statusMsg = await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("🔍 Scanning all members...")] });
    try {
      await message.guild.members.fetch();
      let added = 0, removed = 0;
      for (const [, member] of message.guild.members.cache) {
        if (member.user.bot) continue;
        const presence = member.presence;
        if (!presence) continue;
        const hasVanity = statusHasVanity(presence, code);
        const hasRole = member.roles.cache.has(role.id);
        if (hasVanity && !hasRole) { await member.roles.add(role, "Vanity role scan").catch(() => {}); added++; }
        else if (!hasVanity && hasRole) { await member.roles.remove(role, "Vanity role scan").catch(() => {}); removed++; }
      }
      await statusMsg.edit({
        embeds: [
          new EmbedBuilder().setColor(C).setTitle("💎 Vanity Role Scan Complete")
            .addFields(
              { name: "✅ Roles Added", value: `\`${added}\``, inline: true },
              { name: "❌ Roles Removed", value: `\`${removed}\``, inline: true },
              { name: "🔍 Scanned For", value: `\`discord.gg/${code}\``, inline: true },
            ).setTimestamp(),
        ],
      });
    } catch { await statusMsg.edit({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Scan failed. Check bot permissions.")] }); }
    return;
  }

  await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Unknown subcommand. Use `!vanityrole help`.")] });
}
