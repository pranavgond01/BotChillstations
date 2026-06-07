import { Router } from "express";
import { ChannelType } from "discord.js";
import { getBotClient } from "../bot/client";
import { db } from "@workspace/db";
import {
  welcomeConfigsTable,
  leaveConfigsTable,
  modlogChannelsTable,
  ticketConfigsTable,
  autoTriggersTable,
  reactionRolesTable,
  noPrefixRolesTable,
  vanityRoleConfigsTable,
  liveLbConfigsTable,
  modCasesTable,
  warningsTable,
  wordbombWinsTable,
} from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";

const router = Router();

const DASHBOARD_SECRET = process.env["DASHBOARD_SECRET"] ?? process.env["SESSION_SECRET"] ?? "";

function auth(req: any, res: any, next: any) {
  if (!DASHBOARD_SECRET) { next(); return; }
  const header = req.headers["authorization"] ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (token !== DASHBOARD_SECRET) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

function randomId(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

router.post("/dashboard/auth", (req, res) => {
  const { password } = req.body as { password?: string };
  if (!DASHBOARD_SECRET || password === DASHBOARD_SECRET) {
    res.json({ token: DASHBOARD_SECRET || "no-auth" });
  } else {
    res.status(401).json({ error: "Invalid password" });
  }
});

router.get("/dashboard/guilds", auth, (_req, res) => {
  const client = getBotClient();
  if (!client?.isReady()) { res.json([]); return; }
  const guilds = client.guilds.cache.map((g) => ({
    id: g.id,
    name: g.name,
    icon: g.iconURL({ size: 128 }) ?? null,
    memberCount: g.memberCount,
  }));
  res.json(guilds);
});

router.get("/dashboard/guilds/:guildId", auth, async (req, res) => {
  const client = getBotClient();
  const guild = client?.guilds.cache.get(req.params.guildId);
  if (!guild) { res.status(404).json({ error: "Guild not found" }); return; }
  const channels = guild.channels.cache
    .filter((c) => [ChannelType.GuildText, ChannelType.GuildCategory, ChannelType.GuildVoice].includes(c.type))
    .map((c) => ({ id: c.id, name: c.name, type: c.type }));
  const roles = guild.roles.cache
    .filter((r) => r.id !== guild.id)
    .sort((a, b) => b.position - a.position)
    .map((r) => ({ id: r.id, name: r.name, color: r.color }));
  res.json({ id: guild.id, name: guild.name, icon: guild.iconURL({ size: 128 }) ?? null, memberCount: guild.memberCount, channels, roles });
});

router.get("/dashboard/guilds/:guildId/stats", auth, async (req, res) => {
  const { guildId } = req.params;
  const [cases, warnings, triggers, rr, wbPlayers] = await Promise.all([
    db.select().from(modCasesTable).where(eq(modCasesTable.guildId, guildId)),
    db.select().from(warningsTable).where(eq(warningsTable.guildId, guildId)),
    db.select().from(autoTriggersTable).where(eq(autoTriggersTable.guildId, guildId)),
    db.select().from(reactionRolesTable).where(eq(reactionRolesTable.guildId, guildId)),
    db.select().from(wordbombWinsTable).where(eq(wordbombWinsTable.guildId, guildId)),
  ]);
  res.json({
    totalCases: cases.length,
    totalWarnings: warnings.length,
    totalTriggers: triggers.length,
    totalReactionRoles: rr.length,
    wordbombTopPlayers: wbPlayers.length,
  });
});

router.get("/dashboard/guilds/:guildId/welcome", auth, async (req, res) => {
  const rows = await db.select().from(welcomeConfigsTable).where(eq(welcomeConfigsTable.guildId, req.params.guildId));
  if (rows.length === 0) { res.json({ enabled: false, channelId: null, message: null }); return; }
  res.json({ enabled: true, channelId: rows[0].channelId, message: rows[0].message });
});

router.put("/dashboard/guilds/:guildId/welcome", auth, async (req, res) => {
  const { channelId, message } = req.body as { channelId: string; message: string };
  await db.insert(welcomeConfigsTable).values({ guildId: req.params.guildId, channelId, message })
    .onConflictDoUpdate({ target: welcomeConfigsTable.guildId, set: { channelId, message } });
  res.json({ ok: true });
});

router.delete("/dashboard/guilds/:guildId/welcome", auth, async (req, res) => {
  await db.delete(welcomeConfigsTable).where(eq(welcomeConfigsTable.guildId, req.params.guildId));
  res.json({ ok: true });
});

router.get("/dashboard/guilds/:guildId/leave", auth, async (req, res) => {
  const rows = await db.select().from(leaveConfigsTable).where(eq(leaveConfigsTable.guildId, req.params.guildId));
  if (rows.length === 0) { res.json({ enabled: false, channelId: null, message: null }); return; }
  res.json({ enabled: true, channelId: rows[0].channelId, message: rows[0].message });
});

router.put("/dashboard/guilds/:guildId/leave", auth, async (req, res) => {
  const { channelId, message } = req.body as { channelId: string; message: string };
  await db.insert(leaveConfigsTable).values({ guildId: req.params.guildId, channelId, message })
    .onConflictDoUpdate({ target: leaveConfigsTable.guildId, set: { channelId, message } });
  res.json({ ok: true });
});

router.delete("/dashboard/guilds/:guildId/leave", auth, async (req, res) => {
  await db.delete(leaveConfigsTable).where(eq(leaveConfigsTable.guildId, req.params.guildId));
  res.json({ ok: true });
});

router.get("/dashboard/guilds/:guildId/modlog", auth, async (req, res) => {
  const rows = await db.select().from(modlogChannelsTable).where(eq(modlogChannelsTable.guildId, req.params.guildId));
  if (rows.length === 0) { res.json({ enabled: false, channelId: null }); return; }
  res.json({ enabled: true, channelId: rows[0].channelId });
});

router.put("/dashboard/guilds/:guildId/modlog", auth, async (req, res) => {
  const { channelId } = req.body as { channelId: string };
  await db.insert(modlogChannelsTable).values({ guildId: req.params.guildId, channelId })
    .onConflictDoUpdate({ target: modlogChannelsTable.guildId, set: { channelId } });
  res.json({ ok: true });
});

router.get("/dashboard/guilds/:guildId/ticket", auth, async (req, res) => {
  const rows = await db.select().from(ticketConfigsTable).where(eq(ticketConfigsTable.guildId, req.params.guildId));
  if (rows.length === 0) { res.json({ enabled: false, panelChannelId: null, categoryId: null, supportRoleId: null, logChannelId: null, count: 0 }); return; }
  const r = rows[0];
  res.json({ enabled: true, panelChannelId: r.panelChannelId || null, categoryId: r.categoryId, supportRoleId: r.supportRoleId, logChannelId: r.logChannelId, count: r.count });
});

router.patch("/dashboard/guilds/:guildId/ticket", auth, async (req, res) => {
  const { categoryId, supportRoleId, logChannelId } = req.body as { categoryId?: string | null; supportRoleId?: string | null; logChannelId?: string | null };
  const updates: Record<string, string | null> = {};
  if (categoryId !== undefined) updates["categoryId"] = categoryId;
  if (supportRoleId !== undefined) updates["supportRoleId"] = supportRoleId;
  if (logChannelId !== undefined) updates["logChannelId"] = logChannelId;
  await db.insert(ticketConfigsTable).values({ guildId: req.params.guildId, panelChannelId: "", panelMessageId: "", count: 0, ...updates })
    .onConflictDoUpdate({ target: ticketConfigsTable.guildId, set: updates });
  res.json({ ok: true });
});

router.get("/dashboard/guilds/:guildId/triggers", auth, async (req, res) => {
  const rows = await db.select().from(autoTriggersTable).where(eq(autoTriggersTable.guildId, req.params.guildId));
  res.json(rows.map((r) => ({ triggerId: r.triggerId, keyword: r.keyword, type: r.type, value: r.value, exact: r.exact })));
});

router.post("/dashboard/guilds/:guildId/triggers", auth, async (req, res) => {
  const { keyword, type, value, exact } = req.body as { keyword: string; type: string; value: string; exact?: boolean };
  const triggerId = randomId();
  await db.insert(autoTriggersTable).values({ triggerId, guildId: req.params.guildId, keyword, type, value, exact: exact ?? false });
  res.status(201).json({ triggerId, keyword, type, value, exact: exact ?? false });
});

router.delete("/dashboard/guilds/:guildId/triggers/:triggerId", auth, async (req, res) => {
  await db.delete(autoTriggersTable).where(
    and(eq(autoTriggersTable.guildId, req.params.guildId), eq(autoTriggersTable.triggerId, req.params.triggerId))
  );
  res.json({ ok: true });
});

router.get("/dashboard/guilds/:guildId/rr", auth, async (req, res) => {
  const rows = await db.select().from(reactionRolesTable).where(eq(reactionRolesTable.guildId, req.params.guildId));
  res.json(rows.map((r) => ({ messageId: r.messageId, emoji: r.emoji, channelId: r.channelId, roleId: r.roleId })));
});

router.post("/dashboard/guilds/:guildId/rr", auth, async (req, res) => {
  const { messageId, emoji, channelId, roleId } = req.body as { messageId: string; emoji: string; channelId: string; roleId: string };
  await db.insert(reactionRolesTable).values({ messageId, emoji, guildId: req.params.guildId, channelId, roleId })
    .onConflictDoUpdate({ target: [reactionRolesTable.messageId, reactionRolesTable.emoji], set: { channelId, roleId } });
  res.status(201).json({ ok: true });
});

router.delete("/dashboard/guilds/:guildId/rr/:messageId/:emoji", auth, async (req, res) => {
  await db.delete(reactionRolesTable).where(
    and(eq(reactionRolesTable.messageId, req.params.messageId), eq(reactionRolesTable.emoji, req.params.emoji))
  );
  res.json({ ok: true });
});

router.get("/dashboard/guilds/:guildId/noprefix", auth, async (req, res) => {
  const rows = await db.select().from(noPrefixRolesTable).where(eq(noPrefixRolesTable.guildId, req.params.guildId));
  if (rows.length === 0) { res.json({ enabled: false, roleId: null }); return; }
  res.json({ enabled: true, roleId: rows[0].roleId });
});

router.put("/dashboard/guilds/:guildId/noprefix", auth, async (req, res) => {
  const { roleId } = req.body as { roleId: string };
  await db.insert(noPrefixRolesTable).values({ guildId: req.params.guildId, roleId })
    .onConflictDoUpdate({ target: noPrefixRolesTable.guildId, set: { roleId } });
  res.json({ ok: true });
});

router.delete("/dashboard/guilds/:guildId/noprefix", auth, async (req, res) => {
  await db.delete(noPrefixRolesTable).where(eq(noPrefixRolesTable.guildId, req.params.guildId));
  res.json({ ok: true });
});

router.get("/dashboard/guilds/:guildId/vanityrole", auth, async (req, res) => {
  const rows = await db.select().from(vanityRoleConfigsTable).where(eq(vanityRoleConfigsTable.guildId, req.params.guildId));
  if (rows.length === 0) { res.json({ enabled: false, roleId: null, code: null }); return; }
  res.json({ enabled: true, roleId: rows[0].roleId, code: rows[0].code });
});

router.put("/dashboard/guilds/:guildId/vanityrole", auth, async (req, res) => {
  const { roleId, code } = req.body as { roleId: string; code?: string | null };
  await db.insert(vanityRoleConfigsTable).values({ guildId: req.params.guildId, roleId, code: code ?? null })
    .onConflictDoUpdate({ target: vanityRoleConfigsTable.guildId, set: { roleId, code: code ?? null } });
  res.json({ ok: true });
});

router.delete("/dashboard/guilds/:guildId/vanityrole", auth, async (req, res) => {
  await db.delete(vanityRoleConfigsTable).where(eq(vanityRoleConfigsTable.guildId, req.params.guildId));
  res.json({ ok: true });
});

router.get("/dashboard/guilds/:guildId/livelbconfig", auth, async (req, res) => {
  const rows = await db.select().from(liveLbConfigsTable).where(eq(liveLbConfigsTable.guildId, req.params.guildId));
  if (rows.length === 0) { res.json({ enabled: false, channelId: null, stat: null, period: null }); return; }
  res.json({ enabled: true, channelId: rows[0].channelId, stat: rows[0].stat, period: rows[0].period });
});

router.put("/dashboard/guilds/:guildId/livelbconfig", auth, async (req, res) => {
  const { channelId, stat, period } = req.body as { channelId: string; stat: string; period: string };
  await db.insert(liveLbConfigsTable).values({ guildId: req.params.guildId, channelId, stat, period })
    .onConflictDoUpdate({ target: liveLbConfigsTable.guildId, set: { channelId, stat, period } });
  res.json({ ok: true });
});

router.delete("/dashboard/guilds/:guildId/livelbconfig", auth, async (req, res) => {
  await db.delete(liveLbConfigsTable).where(eq(liveLbConfigsTable.guildId, req.params.guildId));
  res.json({ ok: true });
});

router.get("/dashboard/guilds/:guildId/cases", auth, async (req, res) => {
  const rows = await db.select().from(modCasesTable)
    .where(eq(modCasesTable.guildId, req.params.guildId))
    .orderBy(desc(modCasesTable.caseId))
    .limit(50);
  res.json(rows.map((r) => ({ caseId: r.caseId, type: r.type, targetId: r.targetId, targetTag: r.targetTag, moderatorId: r.moderatorId, reason: r.reason, timestamp: r.timestamp })));
});

// ── Web Dashboard UI ──────────────────────────────────────────────────────────
router.get("/dashboard", (_req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>CHILLSTATION — Dashboard</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{
  --bg:#0d0f13;--surface:#161920;--card:#1e2028;--accent:#ff3c3c;
  --accent2:#ff6b6b;--text:#e8eaf0;--muted:#7b8099;--border:#2a2d3a;
  --green:#00e676;--yellow:#ffd740;--blue:#448aff;
}
body{background:var(--bg);color:var(--text);font-family:'Segoe UI',system-ui,sans-serif;min-height:100vh}
a{color:var(--accent2);text-decoration:none}

/* Layout */
.layout{display:flex;min-height:100vh}
.sidebar{width:260px;background:var(--surface);border-right:1px solid var(--border);display:flex;flex-direction:column;position:fixed;top:0;left:0;bottom:0;overflow-y:auto;z-index:100}
.main{margin-left:260px;flex:1;padding:28px;max-width:1200px}

/* Sidebar */
.sidebar-header{padding:24px 20px 20px;border-bottom:1px solid var(--border)}
.bot-brand{display:flex;align-items:center;gap:12px}
.bot-avatar{width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,var(--accent),#ff8c42);display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0}
.bot-name{font-weight:700;font-size:15px;color:var(--text)}
.bot-tag{font-size:12px;color:var(--muted)}
.bot-status{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--green);margin-top:4px}
.dot{width:8px;height:8px;border-radius:50%;background:var(--green)}
.sidebar-nav{padding:16px 12px;flex:1}
.nav-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);padding:0 8px;margin-bottom:8px;margin-top:16px}
.nav-link{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:8px;color:var(--muted);font-size:14px;cursor:pointer;transition:.15s;border:none;background:none;width:100%;text-align:left}
.nav-link:hover,.nav-link.active{background:rgba(255,60,60,.12);color:var(--text)}
.nav-link.active{color:var(--accent2);font-weight:600}
.nav-link span{font-size:17px}
.sidebar-footer{padding:16px;border-top:1px solid var(--border);font-size:12px;color:var(--muted);text-align:center}

/* Stats */
.page-title{font-size:22px;font-weight:700;margin-bottom:6px}
.page-sub{font-size:14px;color:var(--muted);margin-bottom:24px}
.stats-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:16px;margin-bottom:32px}
.stat-card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:20px;display:flex;flex-direction:column;gap:6px}
.stat-icon{font-size:28px;margin-bottom:4px}
.stat-value{font-size:28px;font-weight:800;color:var(--text)}
.stat-label{font-size:13px;color:var(--muted)}
.stat-card.accent{border-color:var(--accent);background:rgba(255,60,60,.06)}

/* Sections */
.section{display:none}
.section.visible{display:block}
.card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:22px;margin-bottom:20px}
.card-title{font-size:15px;font-weight:700;margin-bottom:16px;display:flex;align-items:center;gap:8px}
.guild-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px}
.guild-card{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:16px;cursor:pointer;transition:.15s;display:flex;align-items:center;gap:12px}
.guild-card:hover{border-color:var(--accent);transform:translateY(-2px)}
.guild-icon{width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,var(--accent),#ff8c42);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:16px;color:#fff;flex-shrink:0;overflow:hidden}
.guild-icon img{width:100%;height:100%;border-radius:50%;object-fit:cover}
.guild-name{font-size:14px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.guild-count{font-size:12px;color:var(--muted)}

/* Command List */
.cmd-categories{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px}
.cat-btn{background:var(--surface);border:1px solid var(--border);border-radius:20px;padding:6px 14px;font-size:13px;color:var(--muted);cursor:pointer;transition:.15s}
.cat-btn:hover,.cat-btn.active{background:rgba(255,60,60,.15);border-color:var(--accent);color:var(--accent2)}
.cmd-list{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.cmd-item{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:12px 14px}
.cmd-name{font-family:monospace;font-size:13px;color:var(--accent2);font-weight:600}
.cmd-desc{font-size:12px;color:var(--muted);margin-top:3px}

/* Badges */
.badge{display:inline-flex;align-items:center;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700}
.badge-green{background:rgba(0,230,118,.12);color:var(--green)}
.badge-red{background:rgba(255,60,60,.12);color:var(--accent2)}
.badge-blue{background:rgba(68,138,255,.12);color:var(--blue)}
.badge-yellow{background:rgba(255,215,64,.12);color:var(--yellow)}

/* Guild Detail */
.back-btn{background:none;border:1px solid var(--border);color:var(--muted);padding:8px 14px;border-radius:8px;cursor:pointer;font-size:13px;margin-bottom:20px;transition:.15s}
.back-btn:hover{border-color:var(--accent);color:var(--text)}
.detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px}
.detail-table{width:100%;border-collapse:collapse}
.detail-table td{padding:8px 0;font-size:13px;border-bottom:1px solid var(--border)}
.detail-table td:first-child{color:var(--muted);width:40%}
.detail-table td:last-child{color:var(--text);font-weight:500}

/* Loader */
.loader{text-align:center;color:var(--muted);padding:40px;font-size:14px}
.spinner{display:inline-block;width:24px;height:24px;border:3px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:spin .8s linear infinite;margin-right:10px;vertical-align:middle}
@keyframes spin{to{transform:rotate(360deg)}}

/* Scrollbar */
::-webkit-scrollbar{width:6px}
::-webkit-scrollbar-track{background:var(--surface)}
::-webkit-scrollbar-thumb{background:var(--border);border-radius:3px}
::-webkit-scrollbar-thumb:hover{background:var(--muted)}

@media(max-width:768px){
  .sidebar{width:100%;position:static;height:auto}
  .main{margin-left:0}
  .layout{flex-direction:column}
  .cmd-list{grid-template-columns:1fr}
  .detail-grid{grid-template-columns:1fr}
}
</style>
</head>
<body>
<div class="layout">
  <!-- Sidebar -->
  <aside class="sidebar">
    <div class="sidebar-header">
      <div class="bot-brand">
        <div class="bot-avatar">🤖</div>
        <div>
          <div class="bot-name">CHILLSTATION</div>
          <div class="bot-tag">#4910</div>
          <div class="bot-status"><div class="dot"></div><span id="statusText">Loading...</span></div>
        </div>
      </div>
    </div>
    <nav class="sidebar-nav">
      <div class="nav-label">Overview</div>
      <button class="nav-link active" onclick="showSection('home')"><span>🏠</span>Dashboard</button>
      <button class="nav-link" onclick="showSection('servers')"><span>🌐</span>Servers</button>
      <div class="nav-label">Commands</div>
      <button class="nav-link" onclick="showSection('commands')"><span>⌨️</span>Command List</button>
      <div class="nav-label">Info</div>
      <button class="nav-link" onclick="showSection('about')"><span>ℹ️</span>About</button>
    </nav>
    <div class="sidebar-footer">CHILLSTATION Bot • v2.0</div>
  </aside>

  <!-- Main -->
  <main class="main">
    <!-- Home Section -->
    <div class="section visible" id="section-home">
      <div class="page-title">👋 Welcome to the Dashboard</div>
      <div class="page-sub">Real-time overview of CHILLSTATION bot.</div>
      <div class="stats-grid" id="statsGrid">
        <div class="stat-card accent"><div class="stat-icon">🌐</div><div class="stat-value" id="statServers">—</div><div class="stat-label">Servers</div></div>
        <div class="stat-card"><div class="stat-icon">👥</div><div class="stat-value" id="statUsers">—</div><div class="stat-label">Total Members</div></div>
        <div class="stat-card"><div class="stat-icon">⌨️</div><div class="stat-value">140+</div><div class="stat-label">Commands</div></div>
        <div class="stat-card"><div class="stat-icon">⏱️</div><div class="stat-value" id="statUptime">—</div><div class="stat-label">Uptime</div></div>
        <div class="stat-card"><div class="stat-icon">🛡️</div><div class="stat-value" id="statLatency">—</div><div class="stat-label">Ping (ms)</div></div>
        <div class="stat-card"><div class="stat-icon">📅</div><div class="stat-value" id="statDate">—</div><div class="stat-label">Today</div></div>
      </div>

      <div class="card">
        <div class="card-title">📦 Feature Overview</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px">
          ${[
            ["🎉","Giveaways","Create, end & reroll giveaways"],
            ["🛡️","Moderation","Ban, kick, mute, warn, cases"],
            ["🔐","Anti-Nuke","Mass-ban & nuke protection"],
            ["🤖","AutoMod","Spam, caps, links, bad words"],
            ["⚙️","Server Setup","Auto-create roles & channels"],
            ["🏆","Leaderboards","Chat & voice activity tracking"],
            ["🎫","Tickets","Panel-based ticket system"],
            ["🎭","Reaction Roles","Emoji → role assignment"],
            ["💞","Social GIFs","Anime reaction commands"],
            ["🎮","Word Bomb","Multiplayer mini-game"],
            ["📢","Triggers","Keyword auto-responses"],
            ["🔢","Utilities","100+ utility commands"],
          ].map(([icon,name,desc])=>`<div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:12px;display:flex;gap:10px;align-items:flex-start"><div style="font-size:20px">${icon}</div><div><div style="font-size:13px;font-weight:600">${name}</div><div style="font-size:11px;color:var(--muted);margin-top:2px">${desc}</div></div></div>`).join("")}
        </div>
      </div>

      <div class="card">
        <div class="card-title">⚡ Quick Commands</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          ${["!help","!antinuke enable","!automod enable","!setup","!gstart 1h Nitro","!lb","!ticket setup","!rr create"]
            .map(c=>`<code style="background:var(--surface);border:1px solid var(--border);padding:6px 12px;border-radius:6px;font-size:13px;color:var(--accent2)">${c}</code>`).join("")}
        </div>
      </div>
    </div>

    <!-- Servers Section -->
    <div class="section" id="section-servers">
      <div class="page-title">🌐 Servers</div>
      <div class="page-sub">Servers the bot is in.</div>
      <div id="guildListContainer"><div class="loader"><div class="spinner"></div>Loading servers...</div></div>
      <!-- Guild Detail -->
      <div id="guildDetail" style="display:none">
        <button class="back-btn" onclick="closeGuildDetail()">← Back to servers</button>
        <div id="guildDetailContent"></div>
      </div>
    </div>

    <!-- Commands Section -->
    <div class="section" id="section-commands">
      <div class="page-title">⌨️ Command Reference</div>
      <div class="page-sub">All 140+ commands grouped by category. Use prefix <code style="background:var(--surface);padding:2px 6px;border-radius:4px;color:var(--accent2)">!</code> or slash <code style="background:var(--surface);padding:2px 6px;border-radius:4px;color:var(--accent2)">/</code>.</div>
      <div class="cmd-categories" id="cmdCats"></div>
      <div class="cmd-list" id="cmdList"></div>
    </div>

    <!-- About Section -->
    <div class="section" id="section-about">
      <div class="page-title">ℹ️ About CHILLSTATION</div>
      <div class="page-sub">Bot information and stack.</div>
      <div class="card">
        <div class="card-title">🤖 Bot Info</div>
        <table class="detail-table">
          <tr><td>Prefix</td><td><code>!</code> (or no prefix with role)</td></tr>
          <tr><td>Slash Commands</td><td>✅ Supported</td></tr>
          <tr><td>Library</td><td>discord.js v14</td></tr>
          <tr><td>Runtime</td><td>Node.js 24 + TypeScript 5.9</td></tr>
          <tr><td>Database</td><td>PostgreSQL + Drizzle ORM</td></tr>
          <tr><td>Anti-Nuke</td><td>✅ Mass ban/channel/role delete detection</td></tr>
          <tr><td>AutoMod</td><td>✅ Spam, caps, links, invites, bad words</td></tr>
        </table>
      </div>
      <div class="card">
        <div class="card-title">📋 Permissions Required</div>
        <div style="display:flex;flex-direction:column;gap:8px;font-size:13px">
          <div>✅ Administrator (for anti-nuke, setup)</div>
          <div>✅ Manage Server (for automod, config)</div>
          <div>✅ Manage Messages (for purge, moderation)</div>
          <div>✅ Manage Roles (for reaction roles, muted)</div>
          <div>✅ Ban Members (for ban commands)</div>
          <div>✅ View Audit Log (for anti-nuke detection)</div>
        </div>
      </div>
    </div>
  </main>
</div>

<script>
const API = '/api';
let guilds = [];
const startTime = Date.now();

const ALL_COMMANDS = [
  {cat:'🔐 Security',cmds:[
    {n:'!antinuke enable',d:'Enable anti-nuke protection'},
    {n:'!antinuke disable',d:'Disable anti-nuke protection'},
    {n:'!antinuke status',d:'View anti-nuke config'},
    {n:'!antinuke threshold <ban|channel|role> <n>',d:'Set action threshold'},
    {n:'!antinuke whitelist @user',d:'Toggle trusted user whitelist'},
    {n:'!antinuke logs #channel',d:'Set alert log channel'},
    {n:'!automod enable/disable',d:'Toggle automod'},
    {n:'!automod status',d:'View automod config'},
    {n:'!automod badwords add/remove/list/clear',d:'Manage blocked words'},
    {n:'!automod spam <n>',d:'Set spam threshold (msgs/5s)'},
    {n:'!automod caps <n|off>',d:'Block excessive caps messages'},
    {n:'!automod links <on|off>',d:'Block all external links'},
    {n:'!automod invites <on|off>',d:'Block Discord invites'},
    {n:'!automod logs #channel',d:'Set automod log channel'},
    {n:'!automod exempt @role',d:'Exempt a role from automod'},
    {n:'!setup',d:'Auto-create server roles & channels'},
  ]},
  {cat:'🎉 Giveaways',cmds:[
    {n:'!gstart <dur> [winners] <prize>',d:'Start a giveaway (e.g. 1h 2 Nitro)'},
    {n:'!gend <msg_id>',d:'End a giveaway early'},
    {n:'!greroll <msg_id> [amount]',d:'Reroll winner(s)'},
  ]},
  {cat:'🛡️ Moderation',cmds:[
    {n:'!warn @user [reason]',d:'Warn a user'},
    {n:'!warnings @user',d:'View user warnings'},
    {n:'!clearwarnings @user',d:'Clear all warnings'},
    {n:'!mute @user <dur> [reason]',d:'Timeout a user (30s–28d)'},
    {n:'!unmute @user',d:'Remove timeout'},
    {n:'!kick @user [reason]',d:'Kick a user'},
    {n:'!ban @user [reason]',d:'Ban a user'},
    {n:'!unban <id>',d:'Unban by user ID'},
    {n:'!softban @user [reason]',d:'Ban then unban (clears messages)'},
    {n:'!purge <n>',d:'Delete bulk messages (1–100)'},
    {n:'!purgebot [n]',d:'Delete recent bot messages'},
    {n:'!nuke',d:'Clone + delete channel (all msgs)'},
    {n:'!slowmode <sec>',d:'Set channel slowmode'},
    {n:'!lock / !unlock',d:'Lock/unlock channel for everyone'},
    {n:'!voicekick @user',d:'Disconnect from voice channel'},
    {n:'!clearreactions <msg_id>',d:'Remove all reactions from a message'},
  ]},
  {cat:'💞 Social & Reactions',cmds:[
    {n:'!hug @user',d:'Hug with anime GIF 🤗'},
    {n:'!kiss @user',d:'Kiss someone 💋'},
    {n:'!slap @user',d:'Slap someone 👋'},
    {n:'!pat @user',d:'Pat someone ✋'},
    {n:'!poke @user',d:'Poke someone 👉'},
    {n:'!cuddle @user',d:'Cuddle someone 🥰'},
    {n:'!bite @user',d:'Bite someone 😬'},
    {n:'!bonk @user',d:'Bonk someone 🔨'},
    {n:'!kill @user',d:'Eliminate someone ☠️'},
    {n:'!wave [@user]',d:'Wave at someone 👋'},
    {n:'!cry',d:'Cry 😢'},
    {n:'!highfive @user',d:'High five! ✋'},
  ]},
  {cat:'🏆 Leaderboard',cmds:[
    {n:'!lb [daily|weekly|monthly|all]',d:'View chat activity leaderboard'},
    {n:'!lbvc [daily|weekly|monthly|all]',d:'View voice activity leaderboard'},
    {n:'!rank [@user]',d:'View your/someone rank & XP'},
    {n:'!setlb #channel [vc|chat] [period]',d:'Post a live auto-updating leaderboard'},
    {n:'!resetlb [period]',d:'Reset leaderboard stats'},
  ]},
  {cat:'🎫 Tickets',cmds:[
    {n:'!ticket setup [@role]',d:'Post ticket panel in this channel'},
    {n:'!ticket category <id>',d:'Set ticket category'},
    {n:'!ticket logs #channel',d:'Set ticket transcript channel'},
    {n:'!ticket add @user',d:'Add user to ticket'},
    {n:'!ticket remove @user',d:'Remove user from ticket'},
    {n:'!ticket close',d:'Close this ticket'},
  ]},
  {cat:'🎭 Reaction Roles',cmds:[
    {n:'!rr create <title> | <emoji> @role | ...',d:'Create reaction role embed'},
    {n:'!rr add <msg_id> <emoji> @role',d:'Add reaction role to message'},
    {n:'!rr remove <msg_id> <emoji>',d:'Remove a reaction role'},
    {n:'!rr list',d:'List all reaction roles'},
    {n:'!rr clear <msg_id>',d:'Clear reaction roles from a message'},
  ]},
  {cat:'📢 Auto-Triggers',cmds:[
    {n:'!trigger add <keyword> <text>',d:'Auto-reply with text on keyword'},
    {n:'!trigger addembed <keyword> <text>',d:'Auto-reply with embed'},
    {n:'!trigger list',d:'List all triggers'},
    {n:'!trigger remove <keyword>',d:'Remove a trigger'},
    {n:'!trigger clear',d:'Clear all triggers'},
  ]},
  {cat:'🔧 Utility',cmds:[
    {n:'!userinfo [@user]',d:'View user profile & account info'},
    {n:'!serverinfo',d:'View server information'},
    {n:'!avatar [@user]',d:'Get a user\'s avatar'},
    {n:'!servericon',d:'Get the server icon'},
    {n:'!ping',d:'Show bot & API latency'},
    {n:'!uptime',d:'Show bot uptime'},
    {n:'!afk [reason]',d:'Set AFK status'},
    {n:'!snipe',d:'Show last deleted message'},
    {n:'!poll <dur> <question> [| opt1 | opt2]',d:'Create a poll'},
    {n:'!purge <n>',d:'Delete messages in bulk'},
    {n:'!calc <expr>',d:'Calculate a math expression'},
    {n:'!remind <dur> <text>',d:'Set a reminder'},
    {n:'!choose <opt1,opt2,...>',d:'Randomly pick an option'},
    {n:'!coinflip',d:'Flip a coin'},
    {n:'!dice [sides]',d:'Roll a dice'},
    {n:'!8ball <question>',d:'Ask the magic 8-ball'},
    {n:'!members',d:'Show member count breakdown'},
    {n:'!botinfo',d:'Bot stats & uptime'},
  ]},
  {cat:'🎮 Games',cmds:[
    {n:'!rps <rock|paper|scissors>',d:'Play Rock Paper Scissors'},
    {n:'!slots',d:'Spin the slot machine 🎰'},
    {n:'!trivia',d:'Answer a trivia question'},
    {n:'!guess',d:'Guess a number 1–100'},
    {n:'!wordbomb start',d:'Start a Word Bomb game'},
    {n:'!wordbomb end',d:'End the current game'},
    {n:'!wordbomb wins [@user]',d:'View word bomb wins'},
  ]},
  {cat:'😂 Fun',cmds:[
    {n:'!joke',d:'Get a random joke'},
    {n:'!dadjoke',d:'Get a dad joke'},
    {n:'!fact',d:'Get a random fun fact'},
    {n:'!quote',d:'Get an inspirational quote'},
    {n:'!roast @user',d:'Roast someone 🔥'},
    {n:'!compliment @user',d:'Compliment someone 💝'},
    {n:'!ship @user1 @user2',d:'Ship two people 💘'},
    {n:'!rate <thing>',d:'Rate something out of 10 ⭐'},
    {n:'!topic',d:'Random conversation starter'},
    {n:'!mock <text>',d:'mOcK tExT'},
    {n:'!clap <text>',d:'Add 👏 between words'},
    {n:'!binary <text>',d:'Convert to binary'},
    {n:'!morse <text>',d:'Convert to Morse code'},
    {n:'!base64 <text>',d:'Base64 encode/decode'},
    {n:'!password [len]',d:'Generate a secure password'},
    {n:'!cat / !dog / !fox / !duck',d:'Random cute animal image'},
    {n:'!urban <term>',d:'Urban Dictionary lookup'},
    {n:'!wikipedia <query>',d:'Wikipedia summary'},
  ]},
  {cat:'⚙️ Config',cmds:[
    {n:'!setwelcome #channel',d:'Set welcome channel'},
    {n:'!setwelcome message <text>',d:'Set welcome message'},
    {n:'!setwelcome test/disable',d:'Test or disable welcome messages'},
    {n:'!setleave #channel',d:'Set leave channel'},
    {n:'!setleave message <text>',d:'Set leave message'},
    {n:'!noprefix [@role|remove]',d:'Role that can skip the ! prefix'},
    {n:'!vanityrole set @role',d:'Give role to members with vanity URL'},
    {n:'!setmodlog #channel',d:'Set mod-log channel'},
    {n:'!case <id>',d:'Look up a mod case by ID'},
    {n:'!cases [@user]',d:'List recent mod cases'},
    {n:'!setlb #channel [vc|chat] [period]',d:'Live auto-updating leaderboard'},
  ]},
];

let activeCat = 0;

function renderCmds() {
  const cats = document.getElementById('cmdCats');
  const list = document.getElementById('cmdList');
  cats.innerHTML = ALL_COMMANDS.map((c,i)=>
    \`<button class="cat-btn\${i===activeCat?' active':''}" onclick="setCat(\${i})">\${c.cat}</button>\`
  ).join('');
  list.innerHTML = ALL_COMMANDS[activeCat].cmds.map(c=>
    \`<div class="cmd-item"><div class="cmd-name">\${c.n}</div><div class="cmd-desc">\${c.d}</div></div>\`
  ).join('');
}

function setCat(i) { activeCat=i; renderCmds(); }

function showSection(id) {
  document.querySelectorAll('.section').forEach(s=>s.classList.remove('visible'));
  document.querySelectorAll('.nav-link').forEach(b=>b.classList.remove('active'));
  document.getElementById('section-'+id)?.classList.add('visible');
  event?.currentTarget?.classList.add('active');
  if(id==='servers') loadGuilds();
  if(id==='commands') renderCmds();
}

async function loadStats() {
  try {
    const r = await fetch(API+'/dashboard/guilds');
    if(!r.ok) throw new Error();
    const data = await r.json();
    guilds = data;
    document.getElementById('statServers').textContent = data.length;
    const total = data.reduce((s,g)=>s+g.memberCount,0);
    document.getElementById('statUsers').textContent = total.toLocaleString();
    document.getElementById('statusText').textContent = 'Online';
  } catch {
    document.getElementById('statusText').textContent = 'Error loading';
  }
  document.getElementById('statDate').textContent = new Date().toLocaleDateString('en-GB',{day:'numeric',month:'short'});
  setInterval(()=>{
    const ms = Date.now()-startTime;
    const s=Math.floor(ms/1000)%60, m=Math.floor(ms/60000)%60, h=Math.floor(ms/3600000);
    document.getElementById('statUptime').textContent = (h?h+'h ':'')+m+'m '+s+'s';
  }, 1000);
}

async function loadGuilds() {
  const container = document.getElementById('guildListContainer');
  document.getElementById('guildDetail').style.display='none';
  container.style.display='';
  if(guilds.length===0){
    try {
      const r = await fetch(API+'/dashboard/guilds');
      guilds = await r.json();
    } catch {}
  }
  if(guilds.length===0){
    container.innerHTML='<div class="loader">No servers found or bot offline.</div>';
    return;
  }
  container.innerHTML = \`<div class="card"><div class="card-title">🌐 \${guilds.length} Server\${guilds.length!==1?'s':''}</div><div class="guild-grid">\${
    guilds.map(g=>\`<div class="guild-card" onclick="openGuild('\${g.id}')">
      <div class="guild-icon">\${g.icon?\`<img src="\${g.icon}" alt=""/>\`:g.name[0]}</div>
      <div><div class="guild-name">\${g.name}</div><div class="guild-count">\${g.memberCount.toLocaleString()} members</div></div>
    </div>\`).join('')
  }</div></div>\`;
}

async function openGuild(id) {
  document.getElementById('guildListContainer').style.display='none';
  const det = document.getElementById('guildDetail');
  const cont = document.getElementById('guildDetailContent');
  det.style.display='block';
  cont.innerHTML='<div class="loader"><div class="spinner"></div>Loading...</div>';
  try {
    const [gRes, sRes] = await Promise.all([
      fetch(API+'/dashboard/guilds/'+id),
      fetch(API+'/dashboard/guilds/'+id+'/stats'),
    ]);
    const g = await gRes.json();
    const s = await sRes.json();
    cont.innerHTML = \`
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:22px">
        <div class="guild-icon" style="width:60px;height:60px;font-size:22px">\${g.icon?\`<img src="\${g.icon}" alt=""/>\`:g.name[0]}</div>
        <div><div style="font-size:20px;font-weight:700">\${g.name}</div>
        <div style="color:var(--muted);font-size:13px">\${g.memberCount.toLocaleString()} members</div></div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px;margin-bottom:20px">
        <div class="stat-card"><div class="stat-value">\${s.totalCases||0}</div><div class="stat-label">Mod Cases</div></div>
        <div class="stat-card"><div class="stat-value">\${s.totalWarnings||0}</div><div class="stat-label">Warnings</div></div>
        <div class="stat-card"><div class="stat-value">\${s.totalTriggers||0}</div><div class="stat-label">Triggers</div></div>
        <div class="stat-card"><div class="stat-value">\${s.totalReactionRoles||0}</div><div class="stat-label">React Roles</div></div>
      </div>
      <div class="detail-grid">
        <div class="card"><div class="card-title">💬 Channels (\${g.channels?.length||0})</div>
          <div style="max-height:200px;overflow-y:auto;font-size:13px;display:flex;flex-direction:column;gap:4px">
            \${(g.channels||[]).slice(0,30).map(c=>\`<div style="color:var(--muted)">\${c.type===0?'#':c.type===2?'🔊':c.type===4?'📁':''} \${c.name}</div>\`).join('')}
          </div>
        </div>
        <div class="card"><div class="card-title">🎭 Roles (\${g.roles?.length||0})</div>
          <div style="max-height:200px;overflow-y:auto;font-size:13px;display:flex;flex-direction:column;gap:6px">
            \${(g.roles||[]).slice(0,20).map(r=>\`<div style="display:flex;align-items:center;gap:6px"><div style="width:10px;height:10px;border-radius:50%;background:\${r.color?'#'+r.color.toString(16).padStart(6,'0'):'#888'}"></div>\${r.name}</div>\`).join('')}
          </div>
        </div>
      </div>\`;
  } catch {
    cont.innerHTML='<div class="loader">❌ Failed to load server details.</div>';
  }
}

function closeGuildDetail() {
  document.getElementById('guildDetail').style.display='none';
  document.getElementById('guildListContainer').style.display='';
}

loadStats();
renderCmds();
</script>
</body>
</html>`);
});

export default router;
