import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
  OverwriteType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type OverwriteResolvable,
  type Message,
  type Client,
  type ButtonInteraction,
  type ModalSubmitInteraction,
  type TextChannel,
  type CategoryChannel,
} from "discord.js";
import { db } from "@workspace/db";
import { ticketConfigsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

interface TicketConfig {
  panelChannelId: string;
  panelMessageId: string;
  categoryId: string | null;
  supportRoleId: string | null;
  logChannelId: string | null;
  count: number;
}

const configs = new Map<string, TicketConfig>();
const openTickets = new Map<string, string>();

export function isOpenTicket(channelId: string): boolean { return openTickets.has(channelId); }
export function getTicketOpener(channelId: string): string | undefined { return openTickets.get(channelId); }
export function removeOpenTicket(channelId: string): void { openTickets.delete(channelId); }

export async function initTicketConfigs(): Promise<void> {
  const rows = await db.select().from(ticketConfigsTable);
  for (const row of rows) {
    configs.set(row.guildId, {
      panelChannelId: row.panelChannelId,
      panelMessageId: row.panelMessageId,
      categoryId: row.categoryId,
      supportRoleId: row.supportRoleId,
      logChannelId: row.logChannelId,
      count: row.count,
    });
  }
}

export function getTicketConfig(guildId: string): TicketConfig | undefined {
  return configs.get(guildId);
}

export async function saveTicketConfigToDb(guildId: string, cfg: TicketConfig): Promise<void> {
  configs.set(guildId, cfg);
  await db.insert(ticketConfigsTable)
    .values({ guildId, panelChannelId: cfg.panelChannelId, panelMessageId: cfg.panelMessageId, categoryId: cfg.categoryId, supportRoleId: cfg.supportRoleId, logChannelId: cfg.logChannelId, count: cfg.count })
    .onConflictDoUpdate({
      target: ticketConfigsTable.guildId,
      set: { panelChannelId: cfg.panelChannelId, panelMessageId: cfg.panelMessageId, categoryId: cfg.categoryId, supportRoleId: cfg.supportRoleId, logChannelId: cfg.logChannelId, count: cfg.count },
    });
}

async function generateTranscript(channel: TextChannel): Promise<string> {
  const messages = await channel.messages.fetch({ limit: 100 });
  const sorted = [...messages.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  return sorted.map((m) => `[${new Date(m.createdTimestamp).toISOString()}] ${m.author.tag}: ${m.content || (m.embeds.length > 0 ? "[embed]" : "[attachment]")}`).join("\n") || "(no messages)";
}

async function closeTicket(client: Client, interaction: ButtonInteraction, saveTranscript: boolean): Promise<void> {
  const channel = interaction.channel as TextChannel;
  const guild = interaction.guild!;
  const config = configs.get(guild.id);
  await interaction.update({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription("🔒 Closing ticket...")], components: [] });
  if (saveTranscript && config?.logChannelId) {
    try {
      const logChannel = (await guild.channels.fetch(config.logChannelId)) as TextChannel;
      const transcript = await generateTranscript(channel);
      const opener = openTickets.get(channel.id);
      await logChannel.send({
        embeds: [
          new EmbedBuilder().setColor(0xff0000).setTitle(`📋 Ticket Transcript — #${channel.name}`)
            .addFields(
              { name: "Channel", value: channel.name, inline: true },
              { name: "Opened by", value: opener ? `<@${opener}>` : "Unknown", inline: true },
              { name: "Closed by", value: `<@${interaction.user.id}>`, inline: true },
            ).setTimestamp(),
        ],
        files: [{ attachment: Buffer.from(transcript, "utf-8"), name: `${channel.name}-transcript.txt` }],
      });
    } catch { /* log channel unavailable */ }
  }
  openTickets.delete(channel.id);
  setTimeout(() => channel.delete().catch(() => {}), 3000);
}

async function createTicketChannel(
  client: Client,
  guild: import("discord.js").Guild,
  user: import("discord.js").User,
  config: TicketConfig,
  issueDescription: string,
  imageLink?: string,
): Promise<TextChannel> {
  config.count++;
  const channelName = `ticket-${user.username.toLowerCase().replace(/[^a-z0-9]/g, "")}-${config.count}`;
  const permOverwrites: OverwriteResolvable[] = [
    { id: guild.id, deny: [PermissionFlagsBits.ViewChannel], type: OverwriteType.Role },
    { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory], type: OverwriteType.Member },
  ];
  if (config.supportRoleId) permOverwrites.push({ id: config.supportRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages], type: OverwriteType.Role });
  const botMember = guild.members.cache.get(client.user!.id);
  if (botMember) permOverwrites.push({ id: botMember.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageMessages], type: OverwriteType.Member });

  const ticketChannel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: config.categoryId ?? undefined,
    permissionOverwrites: permOverwrites,
    topic: `Ticket by ${user.tag} — ${new Date().toISOString()}`,
  }) as TextChannel;

  openTickets.set(ticketChannel.id, user.id);
  await saveTicketConfigToDb(guild.id, config);

  const supportMention = config.supportRoleId ? `<@&${config.supportRoleId}>` : "Staff";
  const embed = new EmbedBuilder().setColor(0xff0000).setTitle("🎫 Support Ticket")
    .setDescription(`Welcome <@${user.id}>! Your issue has been received.\n\n**Ticket #${config.count}**`)
    .addFields({ name: "📋 Issue", value: issueDescription.slice(0, 1024) || "No description provided." })
    .setFooter({ text: "Use the buttons below to manage this ticket." }).setTimestamp();

  if (imageLink && imageLink.trim().length > 0) {
    const trimmed = imageLink.trim();
    if (/^https?:\/\/.+\.(png|jpe?g|gif|webp|svg|bmp|mp4|mov|webm)(\?.*)?$/i.test(trimmed) || /^https?:\/\//.test(trimmed)) {
      embed.setImage(trimmed);
      embed.addFields({ name: "🖼️ Attached Image", value: `[View Image](${trimmed})` });
    }
  }

  await ticketChannel.send({
    content: `<@${user.id}> ${supportMention}`,
    embeds: [embed],
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId("ticket_close").setLabel("Close Ticket").setEmoji("🔒").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("ticket_close_transcript").setLabel("Close & Save Transcript").setEmoji("📋").setStyle(ButtonStyle.Secondary),
      ),
    ],
  });

  return ticketChannel;
}

export async function handleTicketInteraction(client: Client, interaction: ButtonInteraction): Promise<void> {
  if (!interaction.guild) return;

  if (interaction.customId === "ticket_open") {
    const guild = interaction.guild;
    const config = configs.get(guild.id);
    if (!config) {
      await interaction.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription("❌ Ticket system is not configured. Ask an admin to run `/ticket setup`.")], ephemeral: true });
      return;
    }

    const existingChannel = guild.channels.cache.find((ch) => openTickets.get(ch.id) === interaction.user.id);
    if (existingChannel) {
      await interaction.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription(`❌ You already have an open ticket: <#${existingChannel.id}>`)], ephemeral: true });
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId("ticket_modal")
      .setTitle("📝 Open a Support Ticket");

    const issueInput = new TextInputBuilder()
      .setCustomId("ticket_issue")
      .setLabel("Describe your issue")
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder("Please explain your issue in detail...")
      .setMinLength(10)
      .setMaxLength(1000)
      .setRequired(true);

    const imageInput = new TextInputBuilder()
      .setCustomId("ticket_image")
      .setLabel("Image link (optional)")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("https://example.com/screenshot.png")
      .setRequired(false);

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(issueInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(imageInput),
    );

    await interaction.showModal(modal);
    return;
  }

  if (interaction.customId === "ticket_close" || interaction.customId === "ticket_close_transcript") {
    const saveTranscript = interaction.customId === "ticket_close_transcript";
    const canClose = interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels) || openTickets.get(interaction.channelId) === interaction.user.id;
    if (!canClose) { await interaction.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription("❌ Only staff or the ticket opener can close this ticket.")], ephemeral: true }); return; }
    await closeTicket(client, interaction, saveTranscript);
    return;
  }
}

export async function handleTicketModalSubmit(client: Client, interaction: ModalSubmitInteraction): Promise<void> {
  if (!interaction.guild) return;
  if (interaction.customId !== "ticket_modal") return;

  const guild = interaction.guild;
  const config = configs.get(guild.id);
  if (!config) {
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription("❌ Ticket system not configured.")], ephemeral: true });
    return;
  }

  const existingChannel = guild.channels.cache.find((ch) => openTickets.get(ch.id) === interaction.user.id);
  if (existingChannel) {
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription(`❌ You already have an open ticket: <#${existingChannel.id}>`)], ephemeral: true });
    return;
  }

  const issueDescription = interaction.fields.getTextInputValue("ticket_issue");
  const imageLink = interaction.fields.getTextInputValue("ticket_image");

  await interaction.deferReply({ ephemeral: true });

  try {
    const ticketChannel = await createTicketChannel(client, guild, interaction.user, config, issueDescription, imageLink);
    await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x00cc66).setDescription(`✅ Ticket created: <#${ticketChannel.id}>`)] });
  } catch {
    await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription("❌ Failed to create ticket. Check my permissions.")] });
  }
}

export async function handleTicket(client: Client, message: Message): Promise<void> {
  if (!message.guild) return;
  const mod = message.guild.members.cache.get(message.author.id);
  if (!mod?.permissions.has(PermissionFlagsBits.ManageGuild)) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription("❌ You need **Manage Server** permission.")] });
    return;
  }
  const args = message.content.trim().split(/\s+/).slice(1);
  const sub = args[0]?.toLowerCase();

  if (!sub || sub === "help") {
    await message.reply({
      embeds: [
        new EmbedBuilder().setColor(0xff0000).setTitle("🎫 Ticket System")
          .addFields(
            { name: "`!ticket setup [@support-role]`", value: "Post the ticket panel." },
            { name: "`!ticket category <category_id>`", value: "Set category for new tickets." },
            { name: "`!ticket logs #channel`", value: "Set transcript log channel." },
            { name: "`!ticket add @user`", value: "Add user to current ticket." },
            { name: "`!ticket remove @user`", value: "Remove user from current ticket." },
            { name: "`!ticket close`", value: "Close the current ticket." },
          ),
      ],
    });
    return;
  }

  if (sub === "setup") {
    const supportRole = message.mentions.roles.first();
    let existing = configs.get(message.guild.id) ?? { panelChannelId: message.channelId, panelMessageId: "", categoryId: null, supportRoleId: null, logChannelId: null, count: 0 };
    if (supportRole) existing.supportRoleId = supportRole.id;
    const panelMsg = await (message.channel as TextChannel).send({
      embeds: [new EmbedBuilder().setColor(0xff0000).setTitle("🎫 Support Tickets").setDescription("Click the button below to open a support ticket.\n\nA private channel will be created just for you and our staff team.").setFooter({ text: "One ticket per user at a time." })],
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId("ticket_open").setLabel("Open Ticket").setEmoji("🎫").setStyle(ButtonStyle.Primary))],
    });
    existing.panelChannelId = message.channelId;
    existing.panelMessageId = panelMsg.id;
    await saveTicketConfigToDb(message.guild.id, existing);
    await message.delete().catch(() => {});
    return;
  }

  if (sub === "category") {
    const categoryId = args[1];
    if (!categoryId) { await message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription("❌ Usage: `!ticket category <category_id>`")] }); return; }
    const category = message.guild.channels.cache.get(categoryId) as CategoryChannel | undefined;
    if (!category || category.type !== ChannelType.GuildCategory) { await message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription("❌ Could not find a category with that ID.")] }); return; }
    const existing = configs.get(message.guild.id) ?? { panelChannelId: message.channelId, panelMessageId: "", categoryId: null, supportRoleId: null, logChannelId: null, count: 0 };
    existing.categoryId = categoryId;
    await saveTicketConfigToDb(message.guild.id, existing);
    await message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription(`✅ Tickets will be created under **${category.name}**.`)] });
    return;
  }

  if (sub === "logs") {
    const logChannel = message.mentions.channels.first() as TextChannel | undefined;
    if (!logChannel) { await message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription("❌ Usage: `!ticket logs #channel`")] }); return; }
    const existing = configs.get(message.guild.id) ?? { panelChannelId: message.channelId, panelMessageId: "", categoryId: null, supportRoleId: null, logChannelId: null, count: 0 };
    existing.logChannelId = logChannel.id;
    await saveTicketConfigToDb(message.guild.id, existing);
    await message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription(`✅ Ticket transcripts will be saved to ${logChannel}.`)] });
    return;
  }

  if (sub === "add") {
    const target = message.mentions.members?.first();
    if (!target) { await message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription("❌ Usage: `!ticket add @user`")] }); return; }
    if (!openTickets.has(message.channelId)) { await message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription("❌ This is not a ticket channel.")] }); return; }
    await (message.channel as TextChannel).permissionOverwrites.edit(target.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true });
    await message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription(`✅ Added <@${target.id}> to this ticket.`)] });
    return;
  }

  if (sub === "remove") {
    const target = message.mentions.members?.first();
    if (!target) { await message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription("❌ Usage: `!ticket remove @user`")] }); return; }
    if (!openTickets.has(message.channelId)) { await message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription("❌ This is not a ticket channel.")] }); return; }
    await (message.channel as TextChannel).permissionOverwrites.delete(target.id);
    await message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription(`✅ Removed <@${target.id}> from this ticket.`)] });
    return;
  }

  if (sub === "close") {
    if (!openTickets.has(message.channelId)) { await message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription("❌ This is not a ticket channel.")] }); return; }
    const config = configs.get(message.guild.id);
    const channel = message.channel as TextChannel;
    await message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription("🔒 Closing ticket in 3 seconds...")] });
    if (config?.logChannelId) {
      try {
        const logChannel = (await message.guild.channels.fetch(config.logChannelId)) as TextChannel;
        const transcript = await generateTranscript(channel);
        const opener = openTickets.get(channel.id);
        await logChannel.send({
          embeds: [new EmbedBuilder().setColor(0xff0000).setTitle(`📋 Ticket Transcript — #${channel.name}`).addFields({ name: "Closed by", value: `<@${message.author.id}>`, inline: true }, { name: "Opened by", value: opener ? `<@${opener}>` : "Unknown", inline: true }).setTimestamp()],
          files: [{ attachment: Buffer.from(transcript, "utf-8"), name: `${channel.name}-transcript.txt` }],
        });
      } catch { /* log unavailable */ }
    }
    openTickets.delete(channel.id);
    setTimeout(() => channel.delete().catch(() => {}), 3000);
    return;
  }

  await message.reply({ embeds: [new EmbedBuilder().setColor(0xff0000).setDescription("❌ Unknown subcommand. Use `!ticket help`.")] });
}
