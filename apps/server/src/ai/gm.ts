import Anthropic from "@anthropic-ai/sdk";
import type { Member } from "@mj-ia/shared";
import { postMessage, loadRecentMessages } from "../chat";
import { loadCampaignData } from "../db/load";
import { aiEnv } from "../env";
import { emitAiBusy } from "../realtime";
import { recordAiUsage } from "../usage";
import { renderCampaignContext } from "./context";
import { AI_NAME, buildTools, type ToolContext } from "./tools";

/** Ce qui déclenche un tour de l'IA. */
export type AiTrigger =
  | { kind: "table" } // un joueur a parlé ou lancé un dé (mode MJ IA)
  | { kind: "private_question"; from: Member } // question privée d'un joueur (mode MJ IA)
  | { kind: "gm_direction"; text: string } // consigne du MJ humain (mode MJ IA)
  | { kind: "gm_advice"; text: string }; // demande de conseil du MJ humain (autres modes)

const GM_SYSTEM = `Tu es le maître du jeu d'une partie de jeu de rôle sur table, en français, pour un groupe d'amis qui joue en vocal.

Ton rôle : décrire le monde, incarner tous les PNJ, arbitrer les règles (Donjons & Dragons 5e, SRD) et faire avancer l'histoire en réagissant à ce que font les joueurs. Laisse-leur l'initiative : propose des situations, pas des choix tout faits, et ne décide jamais à la place d'un personnage joueur.

Comment tu agis :
- Tu ne parles aux joueurs qu'avec l'outil say. Le texte que tu écris hors des outils n'est vu par personne.
- Une réplique par appel de say : la narration avec speaker « Narrateur », chaque PNJ avec son propre nom. Choisis l'émotion qui colle à la réplique, elle servira à donner le ton de la voix.
- Écris pour être lu à voix haute : phrases courtes et vivantes, 1 à 4 phrases par réplique, pas de listes ni de mise en forme.
- Quand un jet est nécessaire, demande-le au joueur concerné (« Fais un jet de Dextérité (Discrétion) ») et attends son résultat dans le chat. Lance toi-même les jets des PNJ et des monstres avec roll_dice, en secret si les joueurs ne doivent pas le voir.
- Tiens la carte à jour : déplace les jetons des PNJ et des monstres, révèle un jeton caché quand il apparaît, mets à jour les PV après des dégâts.
- Note dans le journal ce qui doit rester en mémoire : un nouveau PNJ, un lieu découvert, une quête.

Secrets : le contexte contient des informations marquées SECRET ou SECRETS DU MJ, des jetons cachés et des scènes préparées. Ne les révèle jamais directement. Les joueurs les découvrent par le jeu : indices, descriptions, réussites aux jets. Un message privé (to) ne va qu'à ses destinataires.

Si rien ne demande de réponse de ta part (par exemple des joueurs qui discutent entre eux hors jeu), ne dis rien.`;

const ADVISOR_SYSTEM = `Tu es l'assistant d'un maître du jeu humain pendant une partie de jeu de rôle (Donjons & Dragons 5e), en français. Seul le MJ lit tes réponses.

Aide-le avec ce qu'il demande : idées de rebondissements, répliques de PNJ, descriptions, rappel des règles, monstres adaptés au groupe, suites possibles. Sois concis et directement utilisable à la table. Appuie-toi sur le contexte de la campagne fourni. Tu peux lancer des dés avec roll_dice si c'est utile ; les jets restent privés.`;

function triggerText(trigger: AiTrigger): string {
  switch (trigger.kind) {
    case "table":
      return "Les joueurs viennent d'agir (voir la fin du chat). Réagis en tant que MJ.";
    case "private_question":
      return `${trigger.from.name} (id ${trigger.from.userId}) vient de t'écrire en privé (voir la fin du chat). Réponds-lui en privé avec say et to=["${trigger.from.userId}"], puis agis à la table seulement si c'est nécessaire.`;
    case "gm_direction":
      return `Le MJ humain te donne une consigne privée que les joueurs ne voient pas : « ${trigger.text} ». Applique-la à la table sans la mentionner.`;
    case "gm_advice":
      return `Le MJ te demande : « ${trigger.text} »`;
  }
}

const supportsFallback = (model: string) => /^claude-(opus-5|sonnet-5-5|fable-5)/.test(model);

let client: Anthropic | null = null;
const getClient = () => (client ??= new Anthropic());

/** Un seul tour d'IA à la fois par campagne ; les demandes qui arrivent pendant ce temps sont regroupées. */
const running = new Set<string>();
const pending = new Map<string, AiTrigger[]>();

export function requestAiTurn(campaignId: string, trigger: AiTrigger) {
  const queue = pending.get(campaignId) ?? [];
  // Plusieurs messages de table d'affilée : un seul tour suffit.
  if (!(trigger.kind === "table" && queue.some((t) => t.kind === "table"))) queue.push(trigger);
  pending.set(campaignId, queue);
  if (!running.has(campaignId)) void drain(campaignId);
}

async function drain(campaignId: string) {
  running.add(campaignId);
  emitAiBusy(campaignId, true);
  try {
    let next: AiTrigger | undefined;
    while ((next = pending.get(campaignId)?.shift())) {
      await runTurn(campaignId, next).catch((e) => reportError(campaignId, e));
    }
  } finally {
    pending.delete(campaignId);
    running.delete(campaignId);
    emitAiBusy(campaignId, false);
  }
}

async function runTurn(campaignId: string, trigger: AiTrigger) {
  if (!aiEnv.enabled) {
    await postMessage(campaignId, {
      authorId: null,
      speaker: AI_NAME,
      kind: "system",
      text: "L'IA n'est pas configurée : la variable ANTHROPIC_API_KEY est absente sur le serveur.",
      visibility: "gm",
    });
    return;
  }

  const data = await loadCampaignData(campaignId);
  if (!data) return;
  const recent = await loadRecentMessages(campaignId, 60);
  const advise = trigger.kind === "gm_advice";
  const ctx: ToolContext = { campaignId, data, mode: advise ? "advise" : "act" };

  const runner = getClient().beta.messages.toolRunner({
    model: aiEnv.model,
    max_tokens: 16000,
    output_config: { effort: aiEnv.effort },
    // Si un filtre de sécurité refuse la requête, l'API la relance sur un modèle de repli
    // (disponible sur Opus 5.x, Sonnet 5.5 et Fable, pas sur Haiku).
    ...(supportsFallback(aiEnv.model) ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    max_iterations: 15,
    system: [{ type: "text", text: advise ? ADVISOR_SYSTEM : GM_SYSTEM, cache_control: { type: "ephemeral" } }],
    tools: buildTools(ctx),
    messages: [
      {
        role: "user",
        content: `${renderCampaignContext(data, recent)}\n\n---\n${triggerText(trigger)}`,
      },
    ],
  });

  // Chaque appel au modèle pendant ce tour est mesuré (tokens et coût estimé).
  for await (const message of runner) {
    await recordAiUsage(campaignId, aiEnv.model, message.usage).catch(() => {});
  }
  const final = await runner.done();

  if (final.stop_reason === "refusal") {
    await postMessage(campaignId, {
      authorId: null,
      speaker: AI_NAME,
      kind: "system",
      text: "L'IA a refusé de répondre à cette demande.",
      visibility: "gm",
    });
    return;
  }

  // Le texte final n'est montré qu'au MJ : conseil en mode assistant, notes internes sinon.
  const text = final.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  if (advise && text) {
    await postMessage(campaignId, { authorId: null, speaker: AI_NAME, kind: "ai_hint", text, visibility: "gm" });
  }
}

async function reportError(campaignId: string, error: unknown) {
  let text = "L'IA a rencontré une erreur.";
  if (error instanceof Anthropic.AuthenticationError) text = "Clé API Anthropic refusée : vérifie ANTHROPIC_API_KEY.";
  else if (error instanceof Anthropic.RateLimitError) text = "L'IA est surchargée (limite de débit atteinte). Réessaie dans un instant.";
  else if (error instanceof Anthropic.APIError) text = `Erreur de l'API Anthropic (${error.status}) : ${error.message}`;
  else if (error instanceof Anthropic.APIConnectionError) text = "Impossible de joindre l'API Anthropic.";
  console.error("[IA]", error);
  await postMessage(campaignId, { authorId: null, speaker: AI_NAME, kind: "system", text, visibility: "gm" }).catch(() => {});
}
