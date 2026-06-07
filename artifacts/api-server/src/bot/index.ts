import {
  Client,
  GatewayIntentBits,
  Partials,
  type MessageReaction,
  type User,
  type GuildMember,
  type Message,
  type PartialMessage,
  type VoiceState,
  type Interaction,
  type ButtonInteraction,
  type Presence,
  type GuildBan,
  type GuildChannel,
  type Role,
} from "discord.js";
import { handleMessage } from "./commands";
import { giveaways, buildGiveawayEmbed } from "./giveaway";
import { handleReactionRoleAdd, handleReactionRoleRemove, initReactionRoles } from "./reactionroles";
import { handleWelcomeMember } from "./welcome";
import { handleLeaveMember } from "./leave";
import { storeSnipe } from "./snipe";
import { handleVoiceStateUpdate, initLiveLb, loadLbFromDb, loadLiveLbConfigsFromDb } from "./leaderboard";
import { handleTicketInteraction, handleTicketModalSubmit, initTicketConfigs } from "./ticket";
import { handlePresenceUpdate, initVanityRoles } from "./vanityrole";
import { initNoPrefixRoles } from "./noprefix";
import { loadPrefixes } from "./prefix";
import { initAutoTriggers } from "./autotrigger";
import { registerSlashCommands, handleSlashCommand } from "./slashcommands";
import { handleAntiNukeBan, handleAntiNukeKick, handleAntiNukeChannelDelete, handleAntiNukeRoleDelete } from "./antinuke";
import { initAutoRoles, handleAutoRoleAssign } from "./autorole";
import { initStickyMessages } from "./sticky";
import { initAutoReact } from "./autoreact";
import { logger } from "../lib/logger";
import { setBotClient } from "./client";

export function createBot(): Client {
  const token = process.env["DISCORD_BOT_TOKEN"];
  if (!token) {
    logger.error("DISCORD_BOT_TOKEN is not set. Bot will not start.");
    return new Client({ intents: [] });
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessageReactions,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildPresences,
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.GuildMember],
  });

  client.once("ready", () => {
    setBotClient(client);
    logger.info({ tag: client.user?.tag }, "Discord bot is ready");
    client.user?.setActivity("🎉 Giveaways | !help");
    void registerSlashCommands(client);
    initLiveLb(client);
    void (async () => {
      try {
        await loadPrefixes();
        await initNoPrefixRoles();
        logger.info("No-prefix roles loaded from DB");
        await initAutoTriggers();
        logger.info("Auto-triggers loaded from DB");
        await initReactionRoles();
        logger.info("Reaction roles loaded from DB");
        await initTicketConfigs();
        logger.info("Ticket configs loaded from DB");
        await initVanityRoles();
        logger.info("Vanity roles loaded from DB");
        await loadLbFromDb();
        logger.info("Leaderboard stats loaded from DB");
        await loadLiveLbConfigsFromDb(client);
        logger.info("Live leaderboard configs loaded from DB");
        await initAutoRoles();
        logger.info("Auto roles loaded from DB");
        await initStickyMessages();
        logger.info("Sticky messages loaded from DB");
        await initAutoReact();
        logger.info("Auto react loaded from DB");
      } catch (err) {
        logger.error({ err }, "Error loading DB data on startup");
      }
    })();
  });

  client.on("messageCreate", async (message: Message) => {
    try { await handleMessage(client, message); }
    catch (err) { logger.error({ err }, "Error handling message"); }
  });

  client.on("messageDelete", (message: Message | PartialMessage) => {
    try { storeSnipe(message); }
    catch (err) { logger.error({ err }, "Error on messageDelete (snipe)"); }
  });

  client.on("guildMemberAdd", async (member: GuildMember) => {
    try { await handleWelcomeMember(member); }
    catch (err) { logger.error({ err }, "Error on guildMemberAdd (welcome)"); }
    try { await handleAutoRoleAssign(member); }
    catch (err) { logger.error({ err }, "Error on guildMemberAdd (autorole)"); }
  });

  client.on("presenceUpdate", async (_old: Presence | null, newPresence: Presence) => {
    try { await handlePresenceUpdate(_old, newPresence); }
    catch (err) { logger.error({ err }, "Error on presenceUpdate (vanityrole)"); }
  });

  client.on("guildMemberRemove", async (member) => {
    try {
      if (member.partial) return;
      await handleLeaveMember(member as GuildMember);
    } catch (err) { logger.error({ err }, "Error on guildMemberRemove (leave)"); }
  });

  client.on("voiceStateUpdate", (oldState: VoiceState, newState: VoiceState) => {
    try { handleVoiceStateUpdate(oldState, newState); }
    catch (err) { logger.error({ err }, "Error on voiceStateUpdate"); }
  });

  client.on("interactionCreate", async (interaction: Interaction) => {
    try {
      if (interaction.isChatInputCommand()) {
        await handleSlashCommand(client, interaction);
        return;
      }
      if (interaction.isModalSubmit()) {
        if (interaction.customId === "ticket_modal") {
          await handleTicketModalSubmit(client, interaction);
        }
        return;
      }
      if (!interaction.isButton()) return;
      const btn = interaction as ButtonInteraction;
      if (btn.customId.startsWith("ticket_")) {
        await handleTicketInteraction(client, btn);
        return;
      }
    } catch (err) { logger.error({ err }, "Error on interactionCreate"); }
  });

  client.on("messageReactionAdd", async (reaction: MessageReaction, user: User) => {
    try {
      if (user.bot) return;
      if (reaction.partial) await reaction.fetch();
      if (reaction.message.partial) await reaction.message.fetch();
      if (reaction.emoji.name === "🎉") {
        const giveaway = giveaways.get(reaction.message.id);
        if (giveaway && !giveaway.ended) {
          giveaway.participants.add(user.id);
          await reaction.message.edit({ embeds: [buildGiveawayEmbed(giveaway)] });
          return;
        }
      }
      await handleReactionRoleAdd(reaction, user);
    } catch (err) { logger.error({ err }, "Error on reactionAdd"); }
  });

  client.on("messageReactionRemove", async (reaction: MessageReaction, user: User) => {
    try {
      if (user.bot) return;
      if (reaction.partial) await reaction.fetch();
      if (reaction.message.partial) await reaction.message.fetch();
      if (reaction.emoji.name === "🎉") {
        const giveaway = giveaways.get(reaction.message.id);
        if (giveaway && !giveaway.ended) {
          giveaway.participants.delete(user.id);
          await reaction.message.edit({ embeds: [buildGiveawayEmbed(giveaway)] });
          return;
        }
      }
      await handleReactionRoleRemove(reaction, user);
    } catch (err) { logger.error({ err }, "Error on reactionRemove"); }
  });

  client.on("guildBanAdd", (ban: GuildBan) => {
    try { handleAntiNukeBan(client, ban); }
    catch (err) { logger.error({ err }, "Error on guildBanAdd (antinuke)"); }
  });

  client.on("guildMemberRemove", (member) => {
    try { handleAntiNukeKick(client, member as GuildMember); }
    catch (err) { logger.error({ err }, "Error on guildMemberRemove (antinuke kick)"); }
  });

  client.on("channelDelete", (channel) => {
    try { handleAntiNukeChannelDelete(client, channel as GuildChannel); }
    catch (err) { logger.error({ err }, "Error on channelDelete (antinuke)"); }
  });

  client.on("roleDelete", (role: Role) => {
    try { handleAntiNukeRoleDelete(client, role); }
    catch (err) { logger.error({ err }, "Error on roleDelete (antinuke)"); }
  });

  client.login(token).catch((err) => { logger.error({ err }, "Failed to login to Discord"); });
  return client;
}
