import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "./db/client";
import { usageEvents } from "./db/schema";

/** Enregistre les caractères d'une réplique lue (ou qui le serait avec une voix payante). */
export async function recordSpeech(campaignId: string, kind: "narration" | "npc", text: string) {
  await db.insert(usageEvents).values({ campaignId, kind: "speech", detail: kind, characters: text.length });
}

export async function recordAiUsage(
  campaignId: string,
  model: string,
  usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null },
) {
  await db.insert(usageEvents).values({
    campaignId,
    kind: "ai",
    detail: model,
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
  });
}

/** Prix publics en $ par million de tokens (entrée, sortie), novembre 2026. Lecture du cache : 10 % de l'entrée, écriture : 125 %. */
const MODEL_PRICES: Record<string, { input: number; output: number }> = {
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
};

function aiCost(model: string, t: { input: number; cacheRead: number; cacheWrite: number; output: number }) {
  const p = MODEL_PRICES[model];
  if (!p) return null;
  return (t.input * p.input + t.cacheRead * p.input * 0.1 + t.cacheWrite * p.input * 1.25 + t.output * p.output) / 1_000_000;
}

/** Abonnements ElevenLabs (relevés d'octobre 2026, à vérifier) : caractères inclus par mois. */
export const ELEVENLABS_PLANS = [
  { name: "Gratuit", price: 0, characters: 10_000 },
  { name: "Starter", price: 6, characters: 30_000 },
  { name: "Creator", price: 22, characters: 121_000 },
  { name: "Pro", price: 99, characters: 600_000 },
];

export interface UsageReport {
  sessions: {
    day: string;
    narrationChars: number;
    npcChars: number;
    aiTurns: number;
    inputTokens: number;
    outputTokens: number;
    aiCostUsd: number | null;
  }[];
  month: { narrationChars: number; npcChars: number; aiCostUsd: number | null; elevenLabsPlanAll: string; elevenLabsPlanNpcOnly: string };
}

function smallestPlan(chars: number) {
  const plan = ELEVENLABS_PLANS.find((p) => p.characters >= chars);
  return plan ? `${plan.name} (${plan.price} $/mois)` : "au-delà de Pro";
}

/** Consommation des 30 derniers jours, regroupée par jour (une soirée = une séance). */
export async function usageReport(campaignId: string): Promise<UsageReport> {
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const day = sql<string>`to_char(${usageEvents.createdAt} at time zone 'Europe/Paris', 'YYYY-MM-DD')`;
  const rows = await db
    .select({
      day,
      kind: usageEvents.kind,
      detail: usageEvents.detail,
      events: sql<number>`count(*)::int`,
      characters: sql<number>`sum(${usageEvents.characters})::int`,
      input: sql<number>`sum(${usageEvents.inputTokens})::int`,
      cacheRead: sql<number>`sum(${usageEvents.cacheReadTokens})::int`,
      cacheWrite: sql<number>`sum(${usageEvents.cacheWriteTokens})::int`,
      output: sql<number>`sum(${usageEvents.outputTokens})::int`,
    })
    .from(usageEvents)
    .where(and(eq(usageEvents.campaignId, campaignId), gte(usageEvents.createdAt, since)))
    .groupBy(day, usageEvents.kind, usageEvents.detail)
    .orderBy(day);

  const byDay = new Map<string, UsageReport["sessions"][number]>();
  for (const r of rows) {
    const s = byDay.get(r.day) ?? { day: r.day, narrationChars: 0, npcChars: 0, aiTurns: 0, inputTokens: 0, outputTokens: 0, aiCostUsd: 0 };
    if (r.kind === "speech") {
      if (r.detail === "narration") s.narrationChars += r.characters;
      else s.npcChars += r.characters;
    } else {
      s.aiTurns += r.events;
      s.inputTokens += r.input + r.cacheRead + r.cacheWrite;
      s.outputTokens += r.output;
      const cost = aiCost(r.detail, { input: r.input, cacheRead: r.cacheRead, cacheWrite: r.cacheWrite, output: r.output });
      s.aiCostUsd = s.aiCostUsd === null || cost === null ? null : s.aiCostUsd + cost;
    }
    byDay.set(r.day, s);
  }
  const sessions = [...byDay.values()];
  const narrationChars = sessions.reduce((a, s) => a + s.narrationChars, 0);
  const npcChars = sessions.reduce((a, s) => a + s.npcChars, 0);
  const costs = sessions.map((s) => s.aiCostUsd);
  return {
    sessions,
    month: {
      narrationChars,
      npcChars,
      aiCostUsd: costs.includes(null) ? null : costs.reduce<number>((a, c) => a + (c ?? 0), 0),
      elevenLabsPlanAll: smallestPlan(narrationChars + npcChars),
      elevenLabsPlanNpcOnly: smallestPlan(npcChars),
    },
  };
}
