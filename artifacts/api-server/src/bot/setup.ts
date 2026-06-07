import {
  type Message,
  PermissionFlagsBits,
  EmbedBuilder,
  ChannelType,
} from "discord.js";

const C = 0xff0000;

export async function handleSetup(message: Message): Promise<void> {
  if (!message.guild) return;
  const member = message.guild.members.cache.get(message.author.id);
  if (!member?.permissions.has(PermissionFlagsBits.Administrator)) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ You need **Administrator** permission.")] });
    return;
  }

  const confirmMsg = await message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(C)
        .setTitle("⚙️ Server Setup")
        .setDescription(
          "This will create the following in your server:\n\n" +
          "**🎭 Roles:** Admin, Moderator, Member, Muted\n" +
          "**📁 Categories:** 📋 Information · 💬 Chat · 🎮 Games · 🔧 Staff\n" +
          "**💬 Channels:** rules, announcements, roles, general, memes, bot-commands, games, staff-chat, mod-logs\n\n" +
          "⚠️ React ✅ to confirm or ❌ to cancel.\n*Existing channels/roles will not be deleted.*"
        )
        .setFooter({ text: "Expires in 30 seconds" }),
    ],
  });

  await confirmMsg.react("✅").catch(() => {});
  await confirmMsg.react("❌").catch(() => {});

  const collected = await confirmMsg.awaitReactions({
    filter: (r, u) => ["✅", "❌"].includes(r.emoji.name ?? "") && u.id === message.author.id,
    max: 1,
    time: 30_000,
  }).catch(() => null);

  await confirmMsg.reactions.removeAll().catch(() => {});
  const pick = collected?.first()?.emoji.name;

  if (!pick || pick === "❌") {
    await confirmMsg.edit({ embeds: [new EmbedBuilder().setColor(C).setDescription("❌ Setup cancelled.")] });
    return;
  }

  await confirmMsg.edit({ embeds: [new EmbedBuilder().setColor(C).setDescription("⚙️ Setting up your server... This may take a moment.")] });

  const guild = message.guild;
  const everyone = guild.roles.everyone;
  const log: string[] = [];

  try {
    // ── Roles ─────────────────────────────────────────────────────────────────
    let mutedRole = guild.roles.cache.find(r => r.name === "Muted");
    if (!mutedRole) {
      mutedRole = await guild.roles.create({ name: "Muted", color: 0x808080, hoist: false, mentionable: false, reason: "[Setup]" });
      log.push("✅ Created **Muted** role");
    } else { log.push("⏭️ **Muted** role exists"); }

    for (const { name, color } of [
      { name: "Admin", color: 0xe74c3c },
      { name: "Moderator", color: 0xe67e22 },
      { name: "Member", color: 0x2ecc71 },
    ]) {
      if (!guild.roles.cache.find(r => r.name === name)) {
        await guild.roles.create({ name, color, hoist: true, mentionable: false, reason: "[Setup]" });
        log.push(`✅ Created **${name}** role`);
      } else { log.push(`⏭️ **${name}** role exists`); }
    }

    const modRole = guild.roles.cache.find(r => r.name === "Moderator");
    const adminRole = guild.roles.cache.find(r => r.name === "Admin");

    // ── Categories + Channels ──────────────────────────────────────────────────
    const structure: Array<{ name: string; channels: string[]; staffOnly?: boolean }> = [
      { name: "📋 Information", channels: ["rules", "announcements", "roles"] },
      { name: "💬 Chat", channels: ["general", "memes", "bot-commands"] },
      { name: "🎮 Games", channels: ["games"] },
      { name: "🔧 Staff", channels: ["staff-chat", "mod-logs"], staffOnly: true },
    ];

    for (const cat of structure) {
      const staffOverwrites = cat.staffOnly ? [
        { id: everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        ...(modRole ? [{ id: modRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }] : []),
        ...(adminRole ? [{ id: adminRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }] : []),
      ] : [];

      let category = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === cat.name);
      if (!category) {
        category = await guild.channels.create({
          name: cat.name,
          type: ChannelType.GuildCategory,
          permissionOverwrites: staffOverwrites,
          reason: "[Setup]",
        });
        log.push(`✅ Created category **${cat.name}**`);
      } else { log.push(`⏭️ Category **${cat.name}** exists`); }

      for (const chName of cat.channels) {
        if (!guild.channels.cache.find(c => c.name === chName)) {
          await guild.channels.create({
            name: chName,
            type: ChannelType.GuildText,
            parent: category.id,
            reason: "[Setup]",
          });
          log.push(`　✅ Created **#${chName}**`);
        } else { log.push(`　⏭️ **#${chName}** exists`); }
      }
    }

    // ── Muted role: deny SendMessages in all text channels ─────────────────────
    if (mutedRole) {
      await Promise.all(
        guild.channels.cache
          .filter(c => c.type === ChannelType.GuildText)
          .map(c => c.permissionOverwrites.create(mutedRole!.id, {
            SendMessages: false,
            AddReactions: false,
            Speak: false,
          }, { reason: "[Setup] Muted role" }).catch(() => {}))
      );
      log.push("✅ Muted role configured on all text channels");
    }

    await confirmMsg.edit({
      embeds: [
        new EmbedBuilder()
          .setColor(0x00ff00)
          .setTitle("✅ Server Setup Complete!")
          .setDescription(log.join("\n"))
          .setFooter({ text: "Review and customise channels & roles as needed." }),
      ],
    });
  } catch (err) {
    await confirmMsg.edit({
      embeds: [
        new EmbedBuilder()
          .setColor(C)
          .setTitle("⚙️ Setup — Partial")
          .setDescription(log.join("\n") + "\n\n❌ Some steps failed. Make sure the bot has **Administrator** permission."),
      ],
    });
  }
}
