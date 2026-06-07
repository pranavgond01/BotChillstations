import {
  EmbedBuilder,
  PermissionFlagsBits,
  type Message,
  type TextChannel,
  type Guild,
} from "discord.js";

const C = 0xff0000;

export async function handleRoleIcon(message: Message): Promise<void> {
  if (!message.guild) return;
  const mod = message.member;
  if (!mod?.permissions.has(PermissionFlagsBits.ManageRoles)) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ You need **Manage Roles** permission.")] });
    return;
  }

  const role = message.mentions.roles.first();
  if (!role) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Usage: `!roleicon @role [emoji]`\nOmit emoji to remove the icon.")] });
    return;
  }

  const args = message.content.trim().split(/\s+/);
  const rawEmoji = args.find((a) => !a.startsWith("<@&") && !a.startsWith("<@") && !a.startsWith("!roleicon") && a.trim().length > 0 && !/^\d+$/.test(a)) ?? null;

  try {
    if (!rawEmoji) {
      // Remove icon
      await role.edit({ unicodeEmoji: null });
      await role.setIcon(null).catch(() => null);
      await message.reply({ embeds: [new EmbedBuilder().setColor(0x57f287).setDescription(`✅ Removed the icon from <@&${role.id}>.`)] });
      return;
    }

    // Custom emoji: <:name:id> or <a:name:id>
    const customMatch = rawEmoji.match(/^<(a)?:[^:]+:(\d+)>$/);
    if (customMatch) {
      const animated = customMatch[1] === "a";
      const emojiId = customMatch[2];
      const ext = animated ? "gif" : "png";
      const url = `https://cdn.discordapp.com/emojis/${emojiId}.${ext}`;
      await role.setIcon(url);
      await message.reply({ embeds: [new EmbedBuilder().setColor(0x57f287).setDescription(`✅ Set the icon of <@&${role.id}> to ${rawEmoji}.`)] });
      return;
    }

    // Unicode emoji — strip variation selectors
    const unicodeEmoji = rawEmoji.replace(/[\uFE0E\uFE0F]/g, "").trim();
    await role.edit({ unicodeEmoji });
    await message.reply({ embeds: [new EmbedBuilder().setColor(0x57f287).setDescription(`✅ Set the icon of <@&${role.id}> to **${unicodeEmoji}**.`)] });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const code = (err as { code?: number | string })?.code;
    const isBoostError =
      code === 50074 || code === "50074" ||
      msg.includes("50074") ||
      msg.includes("FEATURE_REQUIRED") ||
      msg.includes("guild feature") ||
      msg.includes("boosted");
    if (code === 10014 || code === "10014" || msg.includes("10014")) {
      await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Invalid emoji. Use a standard Unicode emoji (e.g. 🔥 🎮 ⭐ 👑) or a custom server emoji.")] });
    } else if (isBoostError) {
      await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Role icons require **Server Boost Level 2** (this server needs at least 7 boosts).")] });
    } else {
      await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(`❌ Failed to update role icon. (Discord error: \`${code ?? msg}\`)\nMake sure my role is above the target role.`)] });
    }
  }
}

export async function handleUserInfo(message: Message): Promise<void> {
  if (!message.guild) return;
  const target =
    message.mentions.members?.first() ??
    message.guild.members.cache.get(message.content.trim().split(/\s+/)[1] ?? "") ??
    message.guild.members.cache.get(message.author.id)!;

  if (!target) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Could not find that member.")] });
    return;
  }

  const roles = target.roles.cache
    .filter((r) => r.id !== message.guild!.id)
    .sort((a, b) => b.position - a.position)
    .map((r) => `<@&${r.id}>`)
    .slice(0, 10)
    .join(", ") || "None";

  const joinedAt = target.joinedAt ? `<t:${Math.floor(target.joinedAt.getTime() / 1000)}:F>` : "Unknown";
  const createdAt = `<t:${Math.floor(target.user.createdAt.getTime() / 1000)}:F>`;

  await message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(C)
        .setTitle(`👤 ${target.user.username}`)
        .setThumbnail(target.user.displayAvatarURL({ size: 256 }))
        .addFields(
          { name: "Display Name", value: target.displayName, inline: true },
          { name: "ID", value: target.id, inline: true },
          { name: "Bot", value: target.user.bot ? "Yes" : "No", inline: true },
          { name: "Account Created", value: createdAt, inline: false },
          { name: "Joined Server", value: joinedAt, inline: false },
          { name: `Roles (${target.roles.cache.size - 1})`, value: roles, inline: false },
        )
        .setFooter({ text: `Requested by ${message.author.username}` })
        .setTimestamp(),
    ],
  });
}

export async function handleServerInfo(message: Message): Promise<void> {
  if (!message.guild) return;
  const guild = message.guild;
  await guild.members.fetch().catch(() => {});

  const owner = await guild.fetchOwner().catch(() => null);
  const createdAt = `<t:${Math.floor(guild.createdAt.getTime() / 1000)}:F>`;
  const humans = guild.members.cache.filter((m) => !m.user.bot).size;
  const bots = guild.members.cache.filter((m) => m.user.bot).size;

  await message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(C)
        .setTitle(`🏠 ${guild.name}`)
        .setThumbnail(guild.iconURL({ size: 256 }) ?? null)
        .addFields(
          { name: "Owner", value: owner ? `<@${owner.id}>` : "Unknown", inline: true },
          { name: "Server ID", value: guild.id, inline: true },
          { name: "Created", value: createdAt, inline: false },
          { name: "Members", value: `👥 **${guild.memberCount}** total | 👤 ${humans} humans | 🤖 ${bots} bots`, inline: false },
          { name: "Channels", value: `${guild.channels.cache.size}`, inline: true },
          { name: "Roles", value: `${guild.roles.cache.size}`, inline: true },
          { name: "Boost Level", value: `Level ${guild.premiumTier}`, inline: true },
        )
        .setFooter({ text: `Requested by ${message.author.username}` })
        .setTimestamp(),
    ],
  });
}

export async function handleAvatar(message: Message): Promise<void> {
  const target =
    message.mentions.users.first() ??
    (message.guild?.members.cache.get(message.content.trim().split(/\s+/)[1] ?? "")?.user) ??
    message.author;

  const avatarUrl = target.displayAvatarURL({ size: 1024 });

  await message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(C)
        .setTitle(`🖼️ ${target.username}'s Avatar`)
        .setImage(avatarUrl)
        .setDescription(`[Open in browser](${avatarUrl})`),
    ],
  });
}

export async function handleRole(message: Message): Promise<void> {
  if (!message.guild) return;
  const mod = message.member;
  if (!mod?.permissions.has(PermissionFlagsBits.ManageRoles)) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ You need **Manage Roles** permission.")] });
    return;
  }

  const mentionedUser = message.mentions.users.first();
  const role = message.mentions.roles.first();

  if (!mentionedUser || !role) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Usage: `!role @user @role`")] });
    return;
  }

  // Fetch member fresh from API to avoid stale cache giving wrong role state
  const target = await message.guild.members.fetch(mentionedUser.id).catch(() => null);
  if (!target) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Could not find that member. Are they still in the server?")] });
    return;
  }

  try {
    if (target.roles.cache.has(role.id)) {
      await target.roles.remove(role);
      await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(`✅ Removed role <@&${role.id}> from **${target.displayName}**.`)] });
    } else {
      await target.roles.add(role);
      await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(`✅ Added role <@&${role.id}> to **${target.displayName}**.`)] });
    }
  } catch {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Failed to manage that role. Check my permissions and role hierarchy.")] });
  }
}

export async function handleNick(message: Message): Promise<void> {
  if (!message.guild) return;
  const mod = message.guild.members.cache.get(message.author.id);
  if (!mod?.permissions.has(PermissionFlagsBits.ManageNicknames)) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ You need **Manage Nicknames** permission.")] });
    return;
  }

  const args = message.content.trim().split(/\s+/).slice(1);
  const target = message.mentions.members?.first();

  if (!target) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Usage: `!nick @user <new nickname>` or `!nick @user reset`")] });
    return;
  }

  const nick = args.slice(1).join(" ");
  const newNick = nick.toLowerCase() === "reset" ? null : nick || null;

  try {
    await target.setNickname(newNick);
    await message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(C)
          .setDescription(
            newNick
              ? `✅ Changed **${target.user.username}**'s nickname to **${newNick}**.`
              : `✅ Reset **${target.user.username}**'s nickname.`
          ),
      ],
    });
  } catch {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Failed to change nickname. Check my role hierarchy.")] });
  }
}

export async function handleAnnounce(message: Message): Promise<void> {
  if (!message.guild) return;
  const mod = message.guild.members.cache.get(message.author.id);
  if (!mod?.permissions.has(PermissionFlagsBits.ManageGuild)) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ You need **Manage Server** permission.")] });
    return;
  }

  const args = message.content.trim().split(/\s+/).slice(1);
  const targetChannel = message.mentions.channels.first() as TextChannel | undefined;

  if (!targetChannel || args.length < 2) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Usage: `!announce #channel <message>`")] });
    return;
  }

  const text = args.slice(1).join(" ");
  if (!text) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Please provide a message to announce.")] });
    return;
  }

  await targetChannel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(C)
        .setDescription(text)
        .setFooter({ text: `Announced by ${message.author.username}` })
        .setTimestamp(),
    ],
  });

  await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(`✅ Announcement sent to ${targetChannel}.`)] });
}

export async function handleServerIcon(message: Message): Promise<void> {
  if (!message.guild) return;
  const icon = message.guild.iconURL({ size: 4096, extension: "png" });
  if (!icon) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ This server has no icon set.")] });
    return;
  }
  await message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(C)
        .setTitle(`🖼️ ${message.guild.name} — Server Icon`)
        .setImage(icon)
        .addFields({ name: "Download", value: `[Full size PNG](${icon})` }),
    ],
  });
}

export async function handleBanner(message: Message): Promise<void> {
  if (!message.guild) return;
  const args = message.content.trim().split(/\s+/).slice(1);

  // User banner
  const target = message.mentions.members?.first() ?? null;
  if (args[0]?.toLowerCase() === "user" || target) {
    const member = target ?? message.guild.members.cache.get(message.author.id)!;
    const user = await member.user.fetch(true).catch(() => member.user);
    const banner = user.bannerURL({ size: 4096, extension: "png" });
    if (!banner) {
      await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(`❌ **${member.displayName}** has no banner set.`)] });
      return;
    }
    await message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(C)
          .setTitle(`🎨 ${member.displayName}'s Banner`)
          .setImage(banner)
          .addFields({ name: "Download", value: `[Full size](${banner})` }),
      ],
    });
    return;
  }

  // Server banner
  await message.guild.fetch();
  const banner = message.guild.bannerURL({ size: 4096, extension: "png" });
  if (!banner) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ This server has no banner set.")] });
    return;
  }
  await message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(C)
        .setTitle(`🎨 ${message.guild.name} — Server Banner`)
        .setImage(banner)
        .addFields({ name: "Download", value: `[Full size](${banner})` }),
    ],
  });
}

// ── !roleinfo ──────────────────────────────────────────────────────────────────
export async function handleRoleInfo(message: Message): Promise<void> {
  if (!message.guild) return;
  const role = message.mentions.roles.first()
    ?? message.guild.roles.cache.find((r) => r.name.toLowerCase() === message.content.trim().split(/\s+/).slice(1).join(" ").toLowerCase());
  if (!role) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Usage: `!roleinfo @role` or `!roleinfo role name`")] });
    return;
  }
  const memberCount = message.guild.members.cache.filter((m) => m.roles.cache.has(role.id)).size;
  const perms = role.permissions.toArray().slice(0, 8).join(", ") || "None";
  await message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(role.color || C)
        .setTitle(`🏷️ Role Info: ${role.name}`)
        .addFields(
          { name: "ID", value: `\`${role.id}\``, inline: true },
          { name: "Color", value: role.hexColor, inline: true },
          { name: "Position", value: `${role.position}`, inline: true },
          { name: "Members", value: `${memberCount}`, inline: true },
          { name: "Mentionable", value: role.mentionable ? "Yes" : "No", inline: true },
          { name: "Hoisted", value: role.hoist ? "Yes" : "No", inline: true },
          { name: "Managed", value: role.managed ? "Yes" : "No", inline: true },
          { name: "Created", value: `<t:${Math.floor(role.createdTimestamp / 1000)}:R>`, inline: true },
          { name: "Key Permissions", value: perms, inline: false },
        ),
    ],
  });
}

// ── !channelinfo ───────────────────────────────────────────────────────────────
export async function handleChannelInfo(message: Message): Promise<void> {
  if (!message.guild) return;
  const ch = message.mentions.channels.first() ?? message.channel;
  const channel = message.guild.channels.cache.get(ch.id);
  if (!channel) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Channel not found.")] });
    return;
  }
  const fields = [
    { name: "ID", value: `\`${channel.id}\``, inline: true },
    { name: "Type", value: channel.type.toString(), inline: true },
    { name: "Created", value: `<t:${Math.floor(channel.createdTimestamp! / 1000)}:R>`, inline: true },
    { name: "Position", value: `${("position" in channel) ? channel.position : "N/A"}`, inline: true },
  ];
  if ("topic" in channel && channel.topic) {
    fields.push({ name: "Topic", value: channel.topic, inline: false });
  }
  if ("nsfw" in channel) {
    fields.push({ name: "NSFW", value: channel.nsfw ? "Yes" : "No", inline: true });
  }
  if ("rateLimitPerUser" in channel && channel.rateLimitPerUser) {
    fields.push({ name: "Slowmode", value: `${channel.rateLimitPerUser}s`, inline: true });
  }
  await message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(C)
        .setTitle(`#️⃣ Channel Info: ${channel.name}`)
        .addFields(fields),
    ],
  });
}

// ── !inviteinfo ────────────────────────────────────────────────────────────────
export async function handleInviteInfo(message: Message): Promise<void> {
  if (!message.guild) return;
  const code = message.content.trim().split(/\s+/)[1]?.replace(/https?:\/\/discord\.gg\//i, "");
  if (!code) { await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Usage: `!inviteinfo <code>`")] }); return; }
  try {
    const invite = await message.client.fetchInvite(code);
    await message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(C)
          .setTitle(`🔗 Invite Info: ${code}`)
          .addFields(
            { name: "Guild", value: invite.guild?.name ?? "N/A", inline: true },
            { name: "Channel", value: invite.channel?.name ?? "N/A", inline: true },
            { name: "Inviter", value: invite.inviter?.tag ?? "N/A", inline: true },
            { name: "Uses", value: invite.uses !== null ? `${invite.uses}${invite.maxUses ? `/${invite.maxUses}` : ""}` : "N/A", inline: true },
            { name: "Expires", value: invite.expiresAt ? `<t:${Math.floor(invite.expiresAt.getTime() / 1000)}:R>` : "Never", inline: true },
            { name: "Temporary", value: invite.temporary ? "Yes" : "No", inline: true },
          )
          .setURL(`https://discord.gg/${code}`),
      ],
    });
  } catch {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Invite not found or expired.")] });
  }
}

// ── !invites ───────────────────────────────────────────────────────────────────
export async function handleInvites(message: Message): Promise<void> {
  if (!message.guild) return;
  const target = message.mentions.members?.first()?.user ?? message.author;
  try {
    const invites = await message.guild.invites.fetch();
    const userInvites = invites.filter((i) => i.inviter?.id === target.id);
    const total = userInvites.reduce((sum, i) => sum + (i.uses ?? 0), 0);
    await message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(C)
          .setDescription(`📨 **${target.username}** has **${total}** invite${total !== 1 ? "s" : ""} (across ${userInvites.size} link${userInvites.size !== 1 ? "s" : ""}).`),
      ],
    });
  } catch {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Failed to fetch invites.")] });
  }
}

// ── !permissions ───────────────────────────────────────────────────────────────
export async function handlePermissions(message: Message): Promise<void> {
  if (!message.guild) return;
  const target = message.mentions.members?.first()
    ?? message.guild.members.cache.get(message.content.trim().split(/\s+/)[1] ?? "") 
    ?? message.guild.members.cache.get(message.author.id);
  if (!target) { await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Member not found.")] }); return; }
  const perms = target.permissions.toArray();
  const granted = perms.map((p) => `✅ ${p.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}`);
  await message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(C)
        .setTitle(`🔐 Permissions: ${target.displayName}`)
        .setDescription(granted.join("\n").slice(0, 2048) || "No permissions"),
    ],
  });
}

// ── !inrole ────────────────────────────────────────────────────────────────────
export async function handleInRole(message: Message): Promise<void> {
  if (!message.guild) return;
  const role = message.mentions.roles.first();
  if (!role) { await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Usage: `!inrole @role`")] }); return; }
  await message.guild.members.fetch();
  const members = message.guild.members.cache.filter((m) => m.roles.cache.has(role.id));
  if (members.size === 0) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(`No members have the **${role.name}** role.`)] });
    return;
  }
  const list = members.first(30).map((m) => m.user.tag).join(", ");
  await message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(C)
        .setTitle(`👥 Members with role: ${role.name} (${members.size})`)
        .setDescription(list + (members.size > 30 ? `\n*...and ${members.size - 30} more*` : "")),
    ],
  });
}

// ── !boosters ─────────────────────────────────────────────────────────────────
export async function handleBoosters(message: Message): Promise<void> {
  if (!message.guild) return;
  await message.guild.members.fetch();
  const boosters = message.guild.members.cache.filter((m) => !!m.premiumSince);
  if (boosters.size === 0) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("💜 No boosters yet.")] });
    return;
  }
  const list = boosters.map((m) => `${m.user.tag} — <t:${Math.floor(m.premiumSince!.getTime() / 1000)}:R>`).join("\n");
  await message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x9b59b6)
        .setTitle(`💜 Server Boosters — ${boosters.size}`)
        .setDescription(list.slice(0, 2048)),
    ],
  });
}

// ── !firstmsg ──────────────────────────────────────────────────────────────────
export async function handleFirstMessage(message: Message): Promise<void> {
  if (!message.guild) return;
  const target = message.mentions.members?.first() ?? null;
  const ch = (message.mentions.channels.first() ?? message.channel) as TextChannel;
  try {
    const messages = await ch.messages.fetch({ limit: 1, after: "0" });
    const first = messages.first();
    if (!first) { await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ No messages found.")] }); return; }
    if (target && first.author.id !== target.id) {
      await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription(`❌ Couldn't find first message from ${target.displayName} (only channel-first is supported).`)] });
      return;
    }
    await message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(C)
          .setTitle("📜 First Message")
          .setDescription(`[Jump to message](${first.url})\n\n${first.content || "(No text content)"}`)
          .setFooter({ text: `Sent by ${first.author.tag}` })
          .setTimestamp(first.createdAt),
      ],
    });
  } catch {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Failed to fetch messages.")] });
  }
}
