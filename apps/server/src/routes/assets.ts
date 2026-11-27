import { randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, stat, unlink } from "node:fs/promises";
import { extname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { canManageAsset, canMoveToken, canSeeAsset, isGm, type AssetKind } from "@mj-ia/shared";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../db/client";
import { toAsset, toToken } from "../db/load";
import { assets, scenes, tokens } from "../db/schema";
import { env } from "../env";
import { broadcastTokens, notifyCampaignChanged } from "../realtime";
import { access, tokenInCampaign } from "./campaigns";

const IMAGE_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};
const DOCUMENT_TYPES: Record<string, string> = {
  ...IMAGE_TYPES,
  ".pdf": "application/pdf",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};
export const MAX_IMAGE_BYTES = 30 * 1024 * 1024;
export const MAX_DOCUMENT_BYTES = 150 * 1024 * 1024;

const kindSchema = z.enum(["map", "token", "document"]);
const idList = z.array(z.string()).max(100);

/** Dossier d'un fichier : les images sont servies en statique, les documents jamais. */
const dirFor = (kind: AssetKind, campaignId: string) => join(kind === "document" ? env.documentDir : env.uploadDir, campaignId);

/** Nom lisible tiré du nom de fichier (« goblin_boss.png » → « goblin boss »). */
export function nameFromFile(filename: string) {
  const base = filename.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  return (base || "Sans nom").slice(0, 100);
}

export async function assetRoutes(app: FastifyInstance) {
  /**
   * Envoi d'un fichier dans la bibliothèque : ?kind=map|token|document.
   * Le MJ envoie tout ; un joueur envoie seulement des images de jeton, visibles de lui seul.
   */
  app.post("/api/campaigns/:id/assets", async (request, reply) => {
    const ctx = await access(request, reply);
    if (!ctx) return;
    const { kind } = z.object({ kind: kindSchema }).parse(request.query);
    const gm = isGm(ctx.member);
    if (!gm && (kind !== "token" || ctx.member.role !== "player")) {
      return reply.code(403).send({ error: "Les joueurs peuvent seulement envoyer des images de jeton" });
    }
    const file = await request.file();
    if (!file) return reply.code(400).send({ error: "Aucun fichier" });
    const ext = extname(file.filename).toLowerCase();
    const types = kind === "document" ? DOCUMENT_TYPES : IMAGE_TYPES;
    const mime = types[ext];
    if (!mime) {
      file.file.resume();
      return reply.code(400).send({ error: kind === "document" ? "PDF, image, .txt ou .md attendu" : "Image PNG, JPG, WEBP ou GIF attendue" });
    }
    const dir = dirFor(kind, ctx.campaignId);
    await mkdir(dir, { recursive: true });
    const name = `${randomBytes(12).toString("hex")}${ext}`;
    const path = join(dir, name);
    await pipeline(file.file, createWriteStream(path));
    const { size } = await stat(path);
    const max = kind === "document" ? MAX_DOCUMENT_BYTES : MAX_IMAGE_BYTES;
    if (file.file.truncated || size > max) {
      await unlink(path);
      return reply.code(413).send({ error: `Fichier trop lourd (${Math.round(max / 1024 / 1024)} Mo max)` });
    }
    const [row] = await db
      .insert(assets)
      .values({
        campaignId: ctx.campaignId,
        kind,
        name: nameFromFile(file.filename),
        file: name,
        mime,
        size,
        uploadedBy: ctx.user.id,
        // Tout est privé par défaut : le MJ choisit ensuite qui voit quoi.
        visibility: "gm",
      })
      .returning();
    notifyCampaignChanged(ctx.campaignId);
    return toAsset(row);
  });

  app.patch("/api/campaigns/:id/assets/:assetId", async (request, reply) => {
    const ctx = await access(request, reply);
    if (!ctx) return;
    const row = await findAsset(request.params as { assetId: string }, ctx.campaignId);
    if (!row || !canManageAsset(toAsset(row), ctx.member)) return reply.code(404).send({ error: "Fichier introuvable" });
    const input = z
      .object({
        name: z.string().trim().min(1).max(100),
        visibility: z.enum(["gm", "all", "some"]),
        visibleTo: idList,
      })
      .partial()
      .parse(request.body);
    // Seul le MJ décide de qui voit un fichier.
    const values = isGm(ctx.member) ? input : { name: input.name };
    await db.update(assets).set(values).where(eq(assets.id, row.id));
    notifyCampaignChanged(ctx.campaignId);
    return { ok: true };
  });

  app.delete("/api/campaigns/:id/assets/:assetId", async (request, reply) => {
    const ctx = await access(request, reply);
    if (!ctx) return;
    const row = await findAsset(request.params as { assetId: string }, ctx.campaignId);
    if (!row || !canManageAsset(toAsset(row), ctx.member)) return reply.code(404).send({ error: "Fichier introuvable" });
    await db.delete(assets).where(eq(assets.id, row.id));
    // On laisse l'image si une scène ou un jeton l'utilise encore ; sinon on la supprime.
    const url = toAsset(row).url;
    const used =
      row.kind !== "document" &&
      ((await db.select({ id: tokens.id }).from(tokens).where(eq(tokens.imageUrl, url)).limit(1)).length > 0 ||
        (await db.select({ id: scenes.id }).from(scenes).where(eq(scenes.mapUrl, url)).limit(1)).length > 0);
    if (!used) await unlink(join(dirFor(row.kind, ctx.campaignId), row.file)).catch(() => {});
    notifyCampaignChanged(ctx.campaignId);
    return { ok: true };
  });

  /** Lecture d'un document : seulement pour qui a le droit de le voir. */
  app.get("/api/campaigns/:id/assets/:assetId/file", async (request, reply) => {
    const ctx = await access(request, reply);
    if (!ctx) return;
    const row = await findAsset(request.params as { assetId: string }, ctx.campaignId);
    if (!row || !canSeeAsset(toAsset(row), ctx.member)) return reply.code(404).send({ error: "Fichier introuvable" });
    const path = join(dirFor(row.kind, ctx.campaignId), row.file);
    const filename = `${row.name}${extname(row.file)}`.replace(/[^\p{L}\p{N} ._-]/gu, "_");
    return reply
      .header("Content-Type", row.mime)
      .header("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(filename)}`)
      .header("X-Content-Type-Options", "nosniff")
      .header("Cache-Control", "private, max-age=3600")
      .send(createReadStream(path));
  });

  /** Un joueur change l'image d'un jeton qu'il contrôle, avec une image de jeton qu'il peut voir. */
  app.patch("/api/campaigns/:id/tokens/:tokenId/image", async (request, reply) => {
    const ctx = await access(request, reply);
    if (!ctx) return;
    const { tokenId } = request.params as { tokenId: string };
    const token = await tokenInCampaign(tokenId, ctx.campaignId);
    if (!token || !canMoveToken(toToken(token), ctx.member)) return reply.code(403).send({ error: "Tu ne contrôles pas ce jeton" });
    const { assetId } = z.object({ assetId: z.string().nullable() }).parse(request.body);
    let imageUrl: string | null = null;
    if (assetId) {
      const row = await findAsset({ assetId }, ctx.campaignId);
      const asset = row && toAsset(row);
      if (!asset || asset.kind !== "token" || !canSeeAsset(asset, ctx.member)) return reply.code(400).send({ error: "Image de jeton inconnue" });
      imageUrl = asset.url;
    }
    await db.update(tokens).set({ imageUrl }).where(eq(tokens.id, tokenId));
    await broadcastTokens(ctx.campaignId, [tokenId]);
    return { ok: true };
  });
}

async function findAsset({ assetId }: { assetId: string }, campaignId: string) {
  const [row] = await db.select().from(assets).where(and(eq(assets.id, assetId), eq(assets.campaignId, campaignId)));
  return row ?? null;
}
