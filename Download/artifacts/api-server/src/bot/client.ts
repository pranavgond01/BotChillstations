import type { Client } from "discord.js";

let _client: Client | null = null;

export function setBotClient(client: Client): void {
  _client = client;
}

export function getBotClient(): Client | null {
  return _client;
}
