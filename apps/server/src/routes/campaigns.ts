import { randomBytes } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, unlink } from "node:fs/promises";
import { extname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { buildCampaignView, canEditSheet, getSystem, isGm, type Member, type User } from "@mj-ia/shared";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireUser } from "../auth/session";
import { db } from "../db/client";
import { loadCampaignData, loadMember } from "../db/load";
import { campaigns, journalEntries, members, scenes, sheets, tokens } from "../db/schema";
import { aiEnv, env } from "../env";
import { loadMessagesFor } from "../chat";
import { usageReport } from "../usage";
import { broadcastTokens, notifyCampaignChanged } from "../realtime";

const visibility = z.enum(["gm", "all", "some"]);
const idList = z.array(z.string()).max(50);

const campaignInput = z.object({
  name: z.string().trim().min(1).max(100),
  system: z.string().default("dnd5e"),
  mode: z.enum(["ai_gm", "ai_assistant", "human"]).default("human"),
});
const sceneInput = z.object({
  name: z.string().trim().min(1).max(100),
  mapUrl: z.string().max(2000).nullable().default(null),
  gridSize: z.number().int().min(10).max(300).default(70),
  width: z.number().int().min(1).max(200).default(20),
  height: z.number().int().min(1).max(200).default(15),
});
const tokenInput = z.object({
  sceneId: z.string(),
  name: z.string().trim().min(1).max(100),
  x: z.number().default(0),
  y: z.number().default(0),
  size: z.number().min(0.25).max(10).default(1),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#c0392b"),
  imageUrl: z.string().max(2000).nullable().default(null),
  sheetId: z.string().nullable().default(null),
  controlledBy: idList.default([]),
  hidden: z.boolean().default(false),
});
const sheetInput = z.object({
  name: z.string().trim().min(1).max(100),
  ownerId: z.string().nullable().default(null),
  data: z.record(z.string(), z.unknown()).default({}),
  visibility: visibility.default("gm"),
  visibleTo: idList.default([]),
});
const journalInput = z.object({
  kind: z.enum(["place", "npc", "quest", "handout", "session", "note"]),
  title: z.string().trim().min(1).max(200),
  content: z.string().max(100_000).default(""),
  gmNotes: z.string().max(100_000).nullable().default(null),
  visibility: visibility.default("gm"),
  visibleTo: idList.default([]),
});

const newInviteCode = () => randomBytes(6).toString("base64url");

type Ctx = { user: User; member: Member; campaignId: string };

/** Vérifie que l'utilisateur est membre (et MJ si demandé) de la campagne de l'URL. */
async function access(request: FastifyRequest, reply: FastifyReply, opts: { gm?: boolean } = {}): Promise<Ctx | null> {
  const user = await requireUser(request, reply);
  if (!user) return null;
  const { id: campaignId } = request.params as { id: string };
  const member = await loadMember(campaignId, user.id);
  if (!member) {
    reply.code(404).send({ error: "Campagne introuvable" });
    return null;
  }
  if (opts.gm && !isGm(member)) {
    reply.code(403).send({ error: "Réservé au MJ" });
    return null;
  }
  return { user, member, campaignId };
}

async function sceneInCampaign(sceneId: string, campaignId: string) {
  const [scene] = await db.select().from(scenes).where(and(eq(scenes.id, sceneId), eq(scenes.campaignId, campaignId)));
  return scene ?? null;
}

async function tokenInCampaign(tokenId: string, campaignId: string) {
  const [row] = await db
    .select({ token: tokens })
    .from(tokens)
    .innerJoin(scenes, eq(scenes.id, tokens.sceneId))
    .where(and(eq(tokens.id, tokenId), eq(scenes.campaignId, campaignId)));
  return row?.token ?? null;
}

function validateSheetData(system: string, data: Record<string, unknown>) {
  return getSystem(system).sheetSchema.parse(data);
}

export async function campaignRoutes(app: FastifyInstance) {
  // --- Campagnes -----------------------------------------------------------
  app.get("/api/campaigns", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    return db
      .select({ id: campaigns.id, name: campaigns.name, system: campaigns.system, mode: campaigns.mode, role: members.role })
      .from(members)
      .innerJoin(campaigns, eq(campaigns.id, members.campaignId))
      .where(eq(members.userId, user.id));
  });

  app.post("/api/campaigns", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const input = campaignInput.parse(request.body);
    getSystem(input.system);
    const campaign = await db.transaction(async (tx) => {
      const [c] = await tx.insert(campaigns).values({ ...input, inviteCode: newInviteCode() }).returning();
      await tx.insert(members).values({ campaignId: c.id, userId: user.id, role: "gm" });
      return c;
    });
    return { id: campaign.id };
  });

  app.post("/api/campaigns/join", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const { code } = z.object({ code: z.string().trim().min(1) }).parse(request.body);
    const [campaign] = await db.select().from(campaigns).where(eq(campaigns.inviteCode, code));
    if (!campaign) return reply.code(404).send({ error: "Code d'invitation invalide" });
    await db.insert(members).values({ campaignId: campaign.id, userId: user.id, role: "player" }).onConflictDoNothing();
    notifyCampaignChanged(campaign.id);
    return { id: campaign.id };
  });

  app.get("/api/campaigns/:id", async (request, reply) => {
    const ctx = await access(request, reply);
    if (!ctx) return;
    const data = await loadCampaignData(ctx.campaignId);
    if (!data) return reply.code(404).send({ error: "Campagne introuvable" });
    return buildCampaignView(data, ctx.member);
  });

  app.get("/api/campaigns/:id/chat", async (request, reply) => {
    const ctx = await access(request, reply);
    if (!ctx) return;
    return loadMessagesFor(ctx.campaignId, ctx.member);
  });

  app.get("/api/ai/status", async () => ({ enabled: aiEnv.enabled }));

  app.get("/api/campaigns/:id/usage", async (request, reply) => {
    const ctx = await access(request, reply, { gm: true });
    if (!ctx) return;
    return usageReport(ctx.campaignId);
  });

  app.patch("/api/campaigns/:id", async (request, reply) => {
    const ctx = await access(request, reply, { gm: true });
    if (!ctx) return;
    const input = z
      .object({
        name: z.string().trim().min(1).max(100),
        mode: z.enum(["ai_gm", "ai_assistant", "human"]),
        activeSceneId: z.string().nullable(),
        regenerateInvite: z.boolean(),
      })
      .partial()
      .parse(request.body);
    if (input.activeSceneId && !(await sceneInCampaign(input.activeSceneId, ctx.campaignId))) {
      return reply.code(400).send({ error: "Scène inconnue" });
    }
    const { regenerateInvite, ...fields } = input;
    await db
      .update(campaigns)
      .set({ ...fields, ...(regenerateInvite ? { inviteCode: newInviteCode() } : {}) })
      .where(eq(campaigns.id, ctx.campaignId));
    notifyCampaignChanged(ctx.campaignId);
    return { ok: true };
  });

  app.delete("/api/campaigns/:id", async (request, reply) => {
    const ctx = await access(request, reply, { gm: true });
    if (!ctx) return;
    await db.delete(campaigns).where(eq(campaigns.id, ctx.campaignId));
    notifyCampaignChanged(ctx.campaignId);
    return { ok: true };
  });

  // --- Membres -------------------------------------------------------------
  app.patch("/api/campaigns/:id/members/:userId", async (request, reply) => {
    const ctx = await access(request, reply, { gm: true });
    if (!ctx) return;
    const { userId } = request.params as { userId: string };
    const { role } = z.object({ role: z.enum(["gm", "player", "spectator"]) }).parse(request.body);
    await db.update(members).set({ role }).where(and(eq(members.campaignId, ctx.campaignId), eq(members.userId, userId)));
    notifyCampaignChanged(ctx.campaignId);
    return { ok: true };
  });

  app.delete("/api/campaigns/:id/members/:userId", async (request, reply) => {
    const ctx = await access(request, reply);
    if (!ctx) return;
    const { userId } = request.params as { userId: string };
    // Un joueur peut quitter la campagne ; seul le MJ peut retirer quelqu'un d'autre.
    if (userId !== ctx.user.id && !isGm(ctx.member)) return reply.code(403).send({ error: "Réservé au MJ" });
    await db.delete(members).where(and(eq(members.campaignId, ctx.campaignId), eq(members.userId, userId)));
    notifyCampaignChanged(ctx.campaignId);
    return { ok: true };
  });

  // --- Scènes --------------------------------------------------------------
  app.post("/api/campaigns/:id/scenes", async (request, reply) => {
    const ctx = await access(request, reply, { gm: true });
    if (!ctx) return;
    const input = sceneInput.parse(request.body);
    const [scene] = await db.insert(scenes).values({ ...input, campaignId: ctx.campaignId }).returning();
    // La première scène devient la scène active.
    const [c] = await db.select().from(campaigns).where(eq(campaigns.id, ctx.campaignId));
    if (!c.activeSceneId) await db.update(campaigns).set({ activeSceneId: scene.id }).where(eq(campaigns.id, ctx.campaignId));
    notifyCampaignChanged(ctx.campaignId);
    return { id: scene.id };
  });

  app.patch("/api/campaigns/:id/scenes/:sceneId", async (request, reply) => {
    const ctx = await access(request, reply, { gm: true });
    if (!ctx) return;
    const { sceneId } = request.params as { sceneId: string };
    if (!(await sceneInCampaign(sceneId, ctx.campaignId))) return reply.code(404).send({ error: "Scène introuvable" });
    await db.update(scenes).set(sceneInput.partial().parse(request.body)).where(eq(scenes.id, sceneId));
    notifyCampaignChanged(ctx.campaignId);
    return { ok: true };
  });

  app.delete("/api/campaigns/:id/scenes/:sceneId", async (request, reply) => {
    const ctx = await access(request, reply, { gm: true });
    if (!ctx) return;
    const { sceneId } = request.params as { sceneId: string };
    if (!(await sceneInCampaign(sceneId, ctx.campaignId))) return reply.code(404).send({ error: "Scène introuvable" });
    await db.delete(scenes).where(eq(scenes.id, sceneId));
    await db
      .update(campaigns)
      .set({ activeSceneId: null })
      .where(and(eq(campaigns.id, ctx.campaignId), eq(campaigns.activeSceneId, sceneId)));
    notifyCampaignChanged(ctx.campaignId);
    return { ok: true };
  });

  // --- Jetons --------------------------------------------------------------
  app.post("/api/campaigns/:id/tokens", async (request, reply) => {
    const ctx = await access(request, reply, { gm: true });
    if (!ctx) return;
    const input = tokenInput.parse(request.body);
    if (!(await sceneInCampaign(input.sceneId, ctx.campaignId))) return reply.code(400).send({ error: "Scène inconnue" });
    const [token] = await db.insert(tokens).values(input).returning();
    await broadcastTokens(ctx.campaignId, [token.id]);
    return { id: token.id };
  });

  app.patch("/api/campaigns/:id/tokens/:tokenId", async (request, reply) => {
    const ctx = await access(request, reply, { gm: true });
    if (!ctx) return;
    const { tokenId } = request.params as { tokenId: string };
    if (!(await tokenInCampaign(tokenId, ctx.campaignId))) return reply.code(404).send({ error: "Jeton introuvable" });
    const input = tokenInput.partial().parse(request.body);
    if (input.sceneId && !(await sceneInCampaign(input.sceneId, ctx.campaignId))) {
      return reply.code(400).send({ error: "Scène inconnue" });
    }
    await db.update(tokens).set(input).where(eq(tokens.id, tokenId));
    await broadcastTokens(ctx.campaignId, [tokenId]);
    return { ok: true };
  });

  app.delete("/api/campaigns/:id/tokens/:tokenId", async (request, reply) => {
    const ctx = await access(request, reply, { gm: true });
    if (!ctx) return;
    const { tokenId } = request.params as { tokenId: string };
    if (!(await tokenInCampaign(tokenId, ctx.campaignId))) return reply.code(404).send({ error: "Jeton introuvable" });
    await db.delete(tokens).where(eq(tokens.id, tokenId));
    await broadcastTokens(ctx.campaignId, [tokenId]);
    return { ok: true };
  });

  // --- Fiches --------------------------------------------------------------
  app.post("/api/campaigns/:id/sheets", async (request, reply) => {
    const ctx = await access(request, reply);
    if (!ctx) return;
    if (ctx.member.role === "spectator") return reply.code(403).send({ error: "Les spectateurs n'ont pas de fiche" });
    const input = sheetInput.parse(request.body);
    const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, ctx.campaignId));
    // Un joueur ne crée que sa propre fiche, et ne choisit pas qui la voit.
    const values = isGm(ctx.member)
      ? input
      : { ...input, ownerId: ctx.user.id, visibility: "gm" as const, visibleTo: [] };
    const [sheet] = await db
      .insert(sheets)
      .values({ ...values, campaignId: ctx.campaignId, system: campaign.system, data: validateSheetData(campaign.system, values.data) })
      .returning();
    notifyCampaignChanged(ctx.campaignId);
    return { id: sheet.id };
  });

  app.patch("/api/campaigns/:id/sheets/:sheetId", async (request, reply) => {
    const ctx = await access(request, reply);
    if (!ctx) return;
    const { sheetId } = request.params as { sheetId: string };
    const [row] = await db.select().from(sheets).where(and(eq(sheets.id, sheetId), eq(sheets.campaignId, ctx.campaignId)));
    if (!row) return reply.code(404).send({ error: "Fiche introuvable" });
    const sheet = { ...row, data: row.data };
    if (!canEditSheet(sheet, ctx.member)) return reply.code(403).send({ error: "Tu ne peux pas modifier cette fiche" });

    const input = sheetInput.partial().parse(request.body);
    // Seul le MJ change le propriétaire et la visibilité.
    const fields = isGm(ctx.member) ? input : { name: input.name, data: input.data };
    await db
      .update(sheets)
      .set({ ...fields, ...(fields.data ? { data: validateSheetData(row.system, fields.data) } : {}) })
      .where(eq(sheets.id, sheetId));
    notifyCampaignChanged(ctx.campaignId);
    return { ok: true };
  });

  app.delete("/api/campaigns/:id/sheets/:sheetId", async (request, reply) => {
    const ctx = await access(request, reply, { gm: true });
    if (!ctx) return;
    const { sheetId } = request.params as { sheetId: string };
    await db.delete(sheets).where(and(eq(sheets.id, sheetId), eq(sheets.campaignId, ctx.campaignId)));
    notifyCampaignChanged(ctx.campaignId);
    return { ok: true };
  });

  // --- Journal -------------------------------------------------------------
  app.post("/api/campaigns/:id/journal", async (request, reply) => {
    const ctx = await access(request, reply, { gm: true });
    if (!ctx) return;
    const [entry] = await db
      .insert(journalEntries)
      .values({ ...journalInput.parse(request.body), campaignId: ctx.campaignId })
      .returning();
    notifyCampaignChanged(ctx.campaignId);
    return { id: entry.id };
  });

  app.patch("/api/campaigns/:id/journal/:entryId", async (request, reply) => {
    const ctx = await access(request, reply, { gm: true });
    if (!ctx) return;
    const { entryId } = request.params as { entryId: string };
    await db
      .update(journalEntries)
      .set(journalInput.partial().parse(request.body))
      .where(and(eq(journalEntries.id, entryId), eq(journalEntries.campaignId, ctx.campaignId)));
    notifyCampaignChanged(ctx.campaignId);
    return { ok: true };
  });

  app.delete("/api/campaigns/:id/journal/:entryId", async (request, reply) => {
    const ctx = await access(request, reply, { gm: true });
    if (!ctx) return;
    const { entryId } = request.params as { entryId: string };
    await db.delete(journalEntries).where(and(eq(journalEntries.id, entryId), eq(journalEntries.campaignId, ctx.campaignId)));
    notifyCampaignChanged(ctx.campaignId);
    return { ok: true };
  });

  // --- Images (cartes, jetons) ----------------------------------------------
  app.post("/api/campaigns/:id/uploads", async (request, reply) => {
    const ctx = await access(request, reply, { gm: true });
    if (!ctx) return;
    const file = await request.file();
    if (!file) return reply.code(400).send({ error: "Aucun fichier" });
    const ext = extname(file.filename).toLowerCase();
    if (![".png", ".jpg", ".jpeg", ".webp", ".gif"].includes(ext) || !file.mimetype.startsWith("image/")) {
      return reply.code(400).send({ error: "Image PNG, JPG, WEBP ou GIF attendue" });
    }
    const dir = join(env.uploadDir, ctx.campaignId);
    await mkdir(dir, { recursive: true });
    const name = `${randomBytes(12).toString("hex")}${ext}`;
    await pipeline(file.file, createWriteStream(join(dir, name)));
    if (file.file.truncated) {
      await unlink(join(dir, name));
      return reply.code(413).send({ error: "Image trop lourde (20 Mo max)" });
    }
    return { url: `/uploads/${ctx.campaignId}/${name}` };
  });
}
