# Discord Bot

A full-featured Discord bot running inside an Express API server. Includes moderation, giveaways, leaderboards, tickets, reaction roles, word bomb mini-game, and more.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server + bot (port 8080)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string (runtime-managed)
- Required secret: `DISCORD_BOT_TOKEN` — Discord bot token from the Developer Portal

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- Bot: discord.js v14
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- Build: esbuild (CJS bundle)

## Where things live

- Bot source: `artifacts/api-server/src/bot/` (32 modules)
- DB schema: `lib/db/src/schema/index.ts` — all 17 tables
- Bot entry: `artifacts/api-server/src/bot/index.ts` → `createBot()`
- Server entry: `artifacts/api-server/src/index.ts`
- Dashboard routes: `artifacts/api-server/src/routes/dashboard.ts`

## Architecture decisions

- Bot runs in-process with Express — `createBot()` called from `index.ts` on startup
- Bot gracefully skips startup if `DISCORD_BOT_TOKEN` is not set (logs error, returns empty client)
- All Discord data (moderation, leaderboards, tickets, etc.) persisted to Postgres via Drizzle
- Slash commands registered on `client.once("ready")` via `registerSlashCommands()`
- `GuildPresences` privileged intent required — must be enabled in Discord Developer Portal

## Product

- **Moderation**: ban, kick, mute, warn, cases log, modlog channel
- **Leaderboards**: message + voice tracking (daily/weekly/monthly/lifetime), live leaderboard channel
- **Giveaways**: create/end/reroll giveaways via commands
- **Tickets**: panel-based ticket system with categories, support roles, log channel
- **Reaction Roles**: assign roles via emoji reactions on messages
- **Auto-Triggers**: keyword-based auto-responses (text/embed/image)
- **Word Bomb**: multiplayer mini-game in Discord
- **Utilities**: AFK, snipe, poll, purge, rank, send, calc, help, vanity roles, no-prefix roles
- **Anti-Nuke**: protection against mass bans, channel/role deletions
- **Welcome/Leave**: configurable join/leave messages per server
- **Auto Roles**: automatically assign roles on member join
- **Sticky Messages**: pin messages that re-post when other messages are sent
- **Auto React**: automatically add emoji reactions in specified channels

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- After changing `lib/db/src/schema/index.ts`, always run `pnpm --filter @workspace/db run push` then restart the workflow
- Discord Developer Portal: enable **Message Content Intent**, **Server Members Intent**, and **Presence Intent** under Privileged Gateway Intents
- The bot starts before DB tables exist on first boot — always push schema before the first run
- Slash commands are registered globally (may take up to 1 hour to appear in all servers)

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
