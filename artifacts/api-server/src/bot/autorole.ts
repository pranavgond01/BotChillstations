import {
  EmbedBuilder,
  PermissionFlagsBits,
  type Message,
  type GuildMember,
} from "discord.js";
import { db, autoRolesTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";

const cache = new Map<string, Set<string>>();

export async function initAutoRoles(): Promise<void> {
  const rows = await db.select().from(autoRolesTable);
  for (const r of rows) {
    if (!cache.has(r.guildId)) cache.set(r.guildId, new Set());
    cache.get(r.guildId)!.add(r.roleId);
  }
}

export async function handleAutoRoleAssign(member: GuildMember): Promise<void> {
  const roles = cache.get(member.guild.id);
  if (!roles || roles.size === 0) return;
  for (const roleId of roles) {
    await member.roles.add(roleId, "Auto Role").catch(() => {});
  }
}

export async function handleAutoRole(message: Message): Promise<void> {
  if (!message.guild) return;
  if (!message.member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription("❌ You need **Manage Server** permission.")] });
    return;
  }
  const args = message.content.trim().split(/\s+/).slice(1);
  const sub = args[0]?.toLowerCase();

  if (sub === "set" || sub === "add") {
    const role = message.mentions.roles.first();
    if (!role) {
      await message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription("❌ Usage: `!autorole set @role`")] });
      return;
    }
    if (!cache.has(message.guild.id)) cache.set(message.guild.id, new Set());
    cache.get(message.guild.id)!.add(role.id);
    await db.insert(autoRolesTable).values({ guildId: message.guild.id, roleId: role.id }).onConflictDoNothing();
    await message.reply({ embeds: [new EmbedBuilder().setColor(0x57f287).setDescription(`✅ Auto role <@&${role.id}> will now be given to all new members.`)] });
    return;
  }

  if (sub === "remove") {
    const role = message.mentions.roles.first();
    if (!role) {
      await message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription("❌ Usage: `!autorole remove @role`")] });
      return;
    }
    cache.get(message.guild.id)?.delete(role.id);
    await db.delete(autoRolesTable).where(and(eq(autoRolesTable.guildId, message.guild.id), eq(autoRolesTable.roleId, role.id)));
    await message.reply({ embeds: [new EmbedBuilder().setColor(0x57f287).setDescription(`✅ Auto role <@&${role.id}> removed.`)] });
    return;
  }

  if (sub === "list") {
    const roles = cache.get(message.guild.id);
    if (!roles || roles.size === 0) {
      await message.reply({ embeds: [new EmbedBuilder().setColor(0x5865f2).setDescription("No auto roles configured.\nUse `!autorole set @role` to add one.")] });
      return;
    }
    await message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle("⚙️ Auto Roles")
          .setDescription([...roles].map(id => `• <@&${id}>`).join("\n")),
      ],
    });
    return;
  }

  await message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("⚙️ Auto Role")
        .setDescription(
          "`!autorole set @role` — assign role to new members\n" +
          "`!autorole remove @role` — remove an auto role\n" +
          "`!autorole list` — list all auto roles",
        ),
    ],
  });
}
