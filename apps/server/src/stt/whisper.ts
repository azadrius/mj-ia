import { sttEnv } from "../env";

/**
 * Transcription par le service Whisper local (docker/whisper).
 * Le fichier WAV part tel quel ; la réponse est le texte reconnu, vide s'il n'y avait pas de parole.
 */
export async function transcribe(wav: Buffer, language = "fr"): Promise<string> {
  const res = await fetch(`${sttEnv.whisperUrl}/transcribe?language=${encodeURIComponent(language)}`, {
    method: "POST",
    headers: { "content-type": "audio/wav" },
    body: new Uint8Array(wav),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`Whisper a répondu ${res.status}`);
  const body = (await res.json()) as { text?: string };
  return cleanTranscript(body.text ?? "");
}

/** Phrases que Whisper invente souvent sur du silence ou du bruit. */
const HALLUCINATIONS = [
  /^sous-titr(es|age).*/i,
  /^merci d'avoir regardé.*/i,
  /^abonnez-vous.*/i,
  /^\.+$/,
  /^…+$/,
];

export function cleanTranscript(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t || HALLUCINATIONS.some((r) => r.test(t))) return "";
  return t;
}
