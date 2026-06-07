import { EmbedBuilder, type Message, type PartialMessage } from "discord.js";

interface Sniped {
  content: string;
  authorId: string;
  authorTag: string;
  authorAvatar: string | null;
  deletedAt: number;
  imageUrl: string | null;
}

export const sniped = new Map<string, Sniped>();
export type { Sniped };

export function storeSnipe(message: Message | PartialMessage): void {
  if (message.author?.bot) return;
  const content = message.content?.trim() ?? "";
  const attachment = message.attachments?.first();
  const imageUrl = attachment?.contentType?.startsWith("image/") ? attachment.url : null;
  if (!content && !imageUrl) return;

  sniped.set(message.channelId, {
    content: content || "(no text)",
    authorId: message.author?.id ?? "unknown",
    authorTag: message.author?.tag ?? "Unknown#0000",
    authorAvatar: message.author?.displayAvatarURL({ size: 256 }) ?? null,
    deletedAt: Date.now(),
    imageUrl,
  });
}

export async function handleSnipe(message: Message): Promise<void> {
  const data = sniped.get(message.channelId);
  if (!data) {
    await message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff0000)
          .setDescription("🔍 There's nothing to snipe in this channel!"),
      ],
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(0xff0000)
    .setAuthor({ name: data.authorTag, iconURL: data.authorAvatar ?? undefined })
    .setDescription(data.content)
    .setFooter({ text: `Deleted` })
    .setTimestamp(data.deletedAt);

  if (data.imageUrl) embed.setImage(data.imageUrl);

  await message.reply({ embeds: [embed] });
}
