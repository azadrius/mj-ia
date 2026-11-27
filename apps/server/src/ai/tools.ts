import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import {
  describeRoll,
  dnd5eSheetSchema,
  EMOTIONS,
  findLeakedSecret,
  rollDice,
  type CampaignData,
} from "@mj-ia/shared";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { postMessage } from "../chat";
import { db } from "../db/client";
import { campaigns, journalEntries, sheets, tokens } from "../db/schema";
import { broadcastTokens, notifyCampaignChanged } from "../realtime";
import { collectSecrets } from "./context";

export const AI_NAME = "MJ IA";

export interface ToolContext {
  campaignId: string;
  data: CampaignData;
  /** "act" : l'IA mène la partie. "advise" : elle ne fait que conseiller le MJ en privé. */
  mode: "act" | "advise";
}

/**
 * Les actions que l'IA peut faire à la table. Chacune vérifie ses entrées
 * et renvoie un texte qui explique le résultat (ou l'erreur) à l'IA.
 */
export const toolImpl = {
  async say(ctx: ToolContext, input: { speaker: string; emotion: (typeof EMOTIONS)[number]; text: string; to: string[] }) {
    const players = new Set(ctx.data.members.map((m) => m.userId));
    const unknown = input.to.filter((id) => !players.has(id));
    if (unknown.length) return `Erreur : destinataires inconnus ${unknown.join(", ")}. Utilise les id des membres.`;
    const leak = findLeakedSecret(input.text, collectSecrets(ctx.data));
    if (leak) {
      return `Refusé : ce texte recopie un secret du MJ (« ${leak} »). Les joueurs ne doivent le découvrir que par le jeu. Reformule sans le révéler.`;
    }
    const narrator = /^narrat/i.test(input.speaker.trim());
    await postMessage(ctx.campaignId, {
      authorId: null,
      speaker: narrator ? "Narrateur" : input.speaker.trim(),
      kind: narrator ? "narration" : "npc",
      text: input.text,
      emotion: input.emotion,
      visibility: input.to.length ? "some" : "all",
      visibleTo: input.to,
    });
    return "Message envoyé.";
  },

  async rollDice(ctx: ToolContext, input: { formula: string; reason: string; secret: boolean }) {
    try {
      const roll = rollDice(input.formula);
      const text = `${input.reason ? `${input.reason} : ` : ""}${describeRoll(roll)}`;
      await postMessage(ctx.campaignId, {
        authorId: null,
        speaker: AI_NAME,
        kind: "roll",
        text,
        roll,
        visibility: input.secret || ctx.mode === "advise" ? "gm" : "all",
      });
      return `Résultat : ${roll.total} (${describeRoll(roll)})`;
    } catch (e) {
      return `Erreur : ${(e as Error).message}`;
    }
  },

  async moveToken(ctx: ToolContext, input: { tokenId: string; x: number; y: number }) {
    const token = ctx.data.tokens.find((t) => t.id === input.tokenId);
    const scene = token && ctx.data.scenes.find((s) => s.id === token.sceneId);
    if (!token || !scene) return "Erreur : jeton inconnu.";
    const x = Math.min(Math.max(0, Math.round(input.x)), scene.width - 1);
    const y = Math.min(Math.max(0, Math.round(input.y)), scene.height - 1);
    await db.update(tokens).set({ x, y }).where(eq(tokens.id, token.id));
    token.x = x;
    token.y = y;
    await broadcastTokens(ctx.campaignId, [token.id]);
    return `${token.name} est maintenant en case (${x}, ${y}).`;
  },

  async setTokenHidden(ctx: ToolContext, input: { tokenId: string; hidden: boolean }) {
    const token = ctx.data.tokens.find((t) => t.id === input.tokenId);
    if (!token) return "Erreur : jeton inconnu.";
    await db.update(tokens).set({ hidden: input.hidden }).where(eq(tokens.id, token.id));
    token.hidden = input.hidden;
    await broadcastTokens(ctx.campaignId, [token.id]);
    return input.hidden ? `${token.name} est caché aux joueurs.` : `${token.name} est révélé aux joueurs.`;
  },

  async updateHp(ctx: ToolContext, input: { sheetId: string; current: number }) {
    const sheet = ctx.data.sheets.find((s) => s.id === input.sheetId);
    if (!sheet) return "Erreur : fiche inconnue.";
    const parsed = dnd5eSheetSchema.safeParse(sheet.data);
    if (!parsed.success) return "Erreur : fiche illisible.";
    const current = Math.min(Math.round(input.current), parsed.data.hp.max);
    const data = { ...parsed.data, hp: { ...parsed.data.hp, current } };
    await db.update(sheets).set({ data }).where(eq(sheets.id, sheet.id));
    sheet.data = data;
    notifyCampaignChanged(ctx.campaignId);
    return `${sheet.name} : ${current}/${parsed.data.hp.max} PV.`;
  },

  async writeJournal(ctx: ToolContext, input: { title: string; kind: "place" | "npc" | "quest" | "handout" | "session" | "note"; content: string; gmNotes: string; visibility: "gm" | "all" }) {
    await db.insert(journalEntries).values({
      campaignId: ctx.campaignId,
      kind: input.kind,
      title: input.title,
      content: input.content,
      gmNotes: input.gmNotes || null,
      visibility: input.visibility,
    });
    notifyCampaignChanged(ctx.campaignId);
    return `Entrée « ${input.title} » ajoutée au journal.`;
  },

  async setActiveScene(ctx: ToolContext, input: { sceneId: string }) {
    const scene = ctx.data.scenes.find((s) => s.id === input.sceneId);
    if (!scene) return "Erreur : scène inconnue.";
    await db.update(campaigns).set({ activeSceneId: scene.id }).where(eq(campaigns.id, ctx.campaignId));
    ctx.data.campaign.activeSceneId = scene.id;
    notifyCampaignChanged(ctx.campaignId);
    return `Les joueurs sont maintenant sur la scène « ${scene.name} ».`;
  },
};

/** Outils exposés au modèle pour un tour donné. */
export function buildTools(ctx: ToolContext) {
  const roll = betaZodTool({
    name: "roll_dice",
    description:
      "Lance des dés (ex. 1d20+5, 2d20kh1 pour l'avantage, 8d6). Le résultat s'affiche dans le chat. " +
      "Utilise secret=true pour les jets que les joueurs ne doivent pas voir (perception passive d'un monstre, jet caché).",
    inputSchema: z.object({
      formula: z.string().describe("Formule de dés"),
      reason: z.string().describe("Ce que représente le jet, ex. « Attaque du gobelin »"),
      secret: z.boolean().describe("true pour un jet visible du MJ seulement"),
    }),
    run: (input) => toolImpl.rollDice(ctx, input),
  });

  if (ctx.mode === "advise") return [roll];

  return [
    betaZodTool({
      name: "say",
      description:
        "Seul moyen de parler aux joueurs. speaker = « Narrateur » pour la narration, sinon le nom du PNJ qui parle. " +
        "Une réplique par appel : un PNJ, une émotion. to = liste d'id de membres pour un message privé, vide pour toute la table.",
      inputSchema: z.object({
        speaker: z.string().describe("« Narrateur » ou nom du PNJ"),
        emotion: z.enum(EMOTIONS).describe("Émotion de la réplique, utilisée pour l'intonation de la voix"),
        text: z.string().describe("Texte dit ou narré, en français"),
        to: z.array(z.string()).describe("id des destinataires ; [] pour tout le monde"),
      }),
      run: (input) => toolImpl.say(ctx, input),
    }),
    roll,
    betaZodTool({
      name: "move_token",
      description: "Déplace un jeton sur la carte (coordonnées en cases, 0,0 = coin haut gauche).",
      inputSchema: z.object({ tokenId: z.string(), x: z.number(), y: z.number() }),
      run: (input) => toolImpl.moveToken(ctx, input),
    }),
    betaZodTool({
      name: "set_token_hidden",
      description: "Cache un jeton aux joueurs ou le révèle (un monstre qui sort de l'ombre, par exemple).",
      inputSchema: z.object({ tokenId: z.string(), hidden: z.boolean() }),
      run: (input) => toolImpl.setTokenHidden(ctx, input),
    }),
    betaZodTool({
      name: "update_hp",
      description: "Fixe les points de vie actuels d'une fiche (après des dégâts ou des soins).",
      inputSchema: z.object({ sheetId: z.string(), current: z.number() }),
      run: (input) => toolImpl.updateHp(ctx, input),
    }),
    betaZodTool({
      name: "write_journal",
      description:
        "Ajoute une entrée au journal : un lieu, un PNJ, une quête, un résumé de séance… " +
        "visibility=all la montre aux joueurs (sans gmNotes), gm la garde pour le MJ.",
      inputSchema: z.object({
        title: z.string(),
        kind: z.enum(["place", "npc", "quest", "handout", "session", "note"]),
        content: z.string().describe("Ce que les joueurs peuvent lire"),
        gmNotes: z.string().describe("Secrets réservés au MJ, ou chaîne vide"),
        visibility: z.enum(["gm", "all"]),
      }),
      run: (input) => toolImpl.writeJournal(ctx, input),
    }),
    betaZodTool({
      name: "set_active_scene",
      description: "Emmène les joueurs sur une autre scène (ils ne voient que la scène active).",
      inputSchema: z.object({ sceneId: z.string() }),
      run: (input) => toolImpl.setActiveScene(ctx, input),
    }),
  ];
}
