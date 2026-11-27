import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pickVoice, speechSettings, type Emotion, type MessageAudio, type VoiceOption } from "@mj-ia/shared";
import { env, ttsEnv } from "../env";

/**
 * Synthèse vocale avec Piper (gratuit, local). Le serveur HTTP de Piper tourne à part :
 * voir docker/piper et le README. Si Piper ne répond pas, les répliques restent écrites.
 */

let cachedVoices: { at: number; voices: VoiceOption[] } | null = null;

/** Voix installées dans Piper (un modèle multi-locuteurs donne une voix par locuteur). */
export async function listVoices(): Promise<VoiceOption[]> {
  if (cachedVoices && Date.now() - cachedVoices.at < 60_000) return cachedVoices.voices;
  const res = await fetch(`${ttsEnv.piperUrl}/voices`, { signal: AbortSignal.timeout(3000) });
  if (!res.ok) throw new Error(`Piper /voices : ${res.status}`);
  const configs = (await res.json()) as Record<string, { language?: { code?: string }; num_speakers?: number; espeak?: { voice?: string } }>;
  const voices: VoiceOption[] = [];
  for (const [model, config] of Object.entries(configs).sort(([a], [b]) => a.localeCompare(b))) {
    const lang = config.language?.code ?? config.espeak?.voice ?? "";
    if (!lang.toLowerCase().startsWith("fr")) continue;
    const speakers = Math.min(config.num_speakers ?? 1, ttsEnv.maxSpeakersPerModel);
    if (speakers <= 1) voices.push({ model, speakerId: null });
    else for (let i = 0; i < speakers; i++) voices.push({ model, speakerId: i });
  }
  cachedVoices = { at: Date.now(), voices };
  return voices;
}

function narratorVoice(voices: VoiceOption[]): VoiceOption | null {
  return voices.find((v) => v.model === ttsEnv.narratorVoice) ?? voices[0] ?? null;
}

/** Lit une réplique et renvoie le fichier audio à jouer, ou null si la voix est désactivée ou en panne. */
export async function synthesize(campaignId: string, speaker: string, text: string, emotion: Emotion | null): Promise<MessageAudio | null> {
  if (ttsEnv.provider !== "piper") return null;
  try {
    const voices = await listVoices();
    const choice = pickVoice(speaker, voices, narratorVoice(voices));
    if (!choice) return null;
    const settings = speechSettings(choice, emotion);
    const res = await fetch(`${ttsEnv.piperUrl}/synthesize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        voice: choice.model,
        ...(choice.speakerId !== null ? { speaker_id: choice.speakerId } : {}),
        length_scale: settings.lengthScale,
        noise_scale: settings.noiseScale,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`Piper /synthesize : ${res.status}`);
    const audio = Buffer.from(await res.arrayBuffer());
    const dir = join(env.uploadDir, "tts", campaignId);
    await mkdir(dir, { recursive: true });
    const name = `${randomBytes(12).toString("hex")}.wav`;
    await writeFile(join(dir, name), audio);
    return { url: `/uploads/tts/${campaignId}/${name}`, pitchCents: settings.pitchCents, volume: settings.volume };
  } catch (e) {
    console.warn("[voix] synthèse impossible :", (e as Error).message);
    return null;
  }
}
