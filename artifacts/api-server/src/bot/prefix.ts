import { db, guildSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

const DEFAULT_PREFIX = "!";
const prefixCache = new Map<string, string>();

export function getPrefix(guildId: string): string {
  return prefixCache.get(guildId) ?? DEFAULT_PREFIX;
}

export async function setPrefix(guildId: string, prefix: string): Promise<void> {
  prefixCache.set(guildId, prefix);
  await db
    .insert(guildSettingsTable)
    .values({ guildId, prefix })
    .onConflictDoUpdate({ target: guildSettingsTable.guildId, set: { prefix } });
}

export async function loadPrefixes(): Promise<void> {
  try {
    const rows = await db.select().from(guildSettingsTable);
    for (const row of rows) {
      prefixCache.set(row.guildId, row.prefix);
    }
    logger.info("Guild prefixes loaded from DB");
  } catch (err) {
    logger.error({ err }, "Failed to load guild prefixes");
  }
}
