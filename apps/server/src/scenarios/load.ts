import { randomBytes } from "node:crypto";
import { copyFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { campaigns, chatMessages, journalEntries, members, scenes, sheets, tokens } from "../db/schema";
import { env } from "../env";
import { SCENARIOS } from "./moulin";

const ASSETS = new URL("./assets", import.meta.url).pathname;

/**
 * Crée une campagne prête à jouer à partir d'un scénario.
 * - as "player" : l'utilisateur joue le PJ prétiré et l'IA mène seule (pas de MJ humain).
 * - as "gm" : l'utilisateur est MJ ; le premier joueur qui rejoint reçoit le PJ prétiré.
 */
export async function createFromScenario(scenarioId: string, userId: string, as: "player" | "gm") {
  const scenario = SCENARIOS[scenarioId];
  if (!scenario) throw new Error("Scénario inconnu");
  const player = as === "player" ? userId : null;

  const campaignId = await db.transaction(async (tx) => {
    const [c] = await tx
      .insert(campaigns)
      .values({ name: scenario.name, system: "dnd5e", mode: "ai_gm", inviteCode: randomBytes(6).toString("base64url") })
      .returning();
    await tx.insert(members).values({ campaignId: c.id, userId, role: as });

    const sheetIds = new Map<string, string>();
    for (const s of scenario.sheets) {
      const [row] = await tx
        .insert(sheets)
        .values({
          campaignId: c.id,
          ownerId: s.pc ? player : null,
          name: s.name,
          system: "dnd5e",
          data: s.data,
          visibility: "gm",
        })
        .returning({ id: sheets.id });
      sheetIds.set(s.key, row.id);
    }

    let active: string | null = null;
    for (const scene of scenario.scenes) {
      const [row] = await tx
        .insert(scenes)
        .values({ campaignId: c.id, name: scene.name, mapUrl: `/uploads/${c.id}/${scene.map}`, width: scene.width, height: scene.height })
        .returning({ id: scenes.id });
      if (scene.key === scenario.activeScene) active = row.id;
      for (const t of scene.tokens) {
        await tx.insert(tokens).values({
          sceneId: row.id,
          name: t.name,
          x: t.x,
          y: t.y,
          color: t.color,
          sheetId: t.sheet ? sheetIds.get(t.sheet) : null,
          controlledBy: t.pc && player ? [player] : [],
          hidden: t.hidden ?? false,
        });
      }
    }
    await tx.update(campaigns).set({ activeSceneId: active }).where(eq(campaigns.id, c.id));

    for (const j of scenario.journal) {
      await tx.insert(journalEntries).values({ campaignId: c.id, ...j, gmNotes: j.gmNotes ?? null });
    }
    await tx.insert(chatMessages).values({
      campaignId: c.id,
      authorId: null,
      speaker: "Table",
      kind: "system",
      text:
        as === "player"
          ? `${scenario.name} est prêt. Ton personnage est Joran (onglet Fiches). Écris « Je suis prêt » pour que le MJ IA lance la partie.`
          : `${scenario.name} est prêt. Invite ton joueur avec le lien du panneau MJ : il recevra Joran. Il écrit ensuite « Je suis prêt » pour lancer la partie.`,
    });
    return c.id;
  });

  // Les cartes sont copiées dans les images de la campagne, comme si le MJ les avait envoyées.
  const dir = join(env.uploadDir, campaignId);
  await mkdir(dir, { recursive: true });
  for (const scene of scenario.scenes) await copyFile(join(ASSETS, scene.map), join(dir, scene.map));
  return campaignId;
}
