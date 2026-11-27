import type { Emotion } from "./chat";

/**
 * Réglages de diction par émotion, pour un moteur comme Piper :
 * - lengthScale : durée des sons (>1 plus lent, <1 plus rapide)
 * - noiseScale : variabilité de la voix (plus haut = plus expressif, moins stable)
 * - pitchCents : décalage de hauteur appliqué à la lecture (100 = un demi-ton)
 * - volume : gain de lecture
 */
export interface Prosody {
  lengthScale: number;
  noiseScale: number;
  pitchCents: number;
  volume: number;
}

export const EMOTION_PROSODY: Record<Emotion, Prosody> = {
  neutre: { lengthScale: 1, noiseScale: 0.667, pitchCents: 0, volume: 1 },
  joie: { lengthScale: 0.92, noiseScale: 0.75, pitchCents: 100, volume: 1.05 },
  colère: { lengthScale: 0.88, noiseScale: 0.85, pitchCents: 50, volume: 1.2 },
  peur: { lengthScale: 0.85, noiseScale: 0.9, pitchCents: 150, volume: 0.95 },
  tristesse: { lengthScale: 1.2, noiseScale: 0.5, pitchCents: -100, volume: 0.85 },
  surprise: { lengthScale: 0.9, noiseScale: 0.8, pitchCents: 200, volume: 1.05 },
  dégoût: { lengthScale: 1.05, noiseScale: 0.7, pitchCents: -50, volume: 1 },
  menace: { lengthScale: 1.15, noiseScale: 0.6, pitchCents: -200, volume: 1.05 },
  mystère: { lengthScale: 1.15, noiseScale: 0.5, pitchCents: -50, volume: 0.9 },
  moquerie: { lengthScale: 0.95, noiseScale: 0.8, pitchCents: 100, volume: 1 },
  solennel: { lengthScale: 1.2, noiseScale: 0.55, pitchCents: -100, volume: 1 },
  chuchoté: { lengthScale: 1.05, noiseScale: 0.3, pitchCents: 0, volume: 0.6 },
};

/** Une voix disponible : un modèle Piper et, s'il en a plusieurs, un locuteur. */
export interface VoiceOption {
  model: string;
  speakerId: number | null;
}

export interface VoiceChoice extends VoiceOption {
  /** Décalage de hauteur propre au personnage, qui s'ajoute à celui de l'émotion. */
  basePitchCents: number;
}

/** Hauteurs utilisées pour distinguer des PNJ qui partageraient le même modèle. */
const PITCH_STEPS = [0, -250, 200, -150, 300, -350, 100];

function hash(text: string) {
  let h = 2166136261;
  for (const c of text.toLowerCase().trim()) {
    h ^= c.codePointAt(0)!;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Attribue une voix stable à un personnage : le même nom donne toujours la même voix.
 * Le narrateur garde sa voix dédiée, et les PNJ se répartissent les autres.
 */
export function pickVoice(speaker: string, voices: VoiceOption[], narrator: VoiceOption | null): VoiceChoice | null {
  if (!voices.length) return null;
  if (/^narrat/i.test(speaker.trim())) {
    return { ...(narrator ?? voices[0]), basePitchCents: 0 };
  }
  // Le narrateur n'est réutilisé pour un PNJ que s'il n'y a pas d'autre voix.
  const pool = voices.length > 1 && narrator
    ? voices.filter((v) => !(v.model === narrator.model && v.speakerId === narrator.speakerId))
    : voices;
  const h = hash(speaker);
  const voice = pool[h % pool.length];
  const basePitchCents = PITCH_STEPS[Math.floor(h / pool.length) % PITCH_STEPS.length];
  return { ...voice, basePitchCents };
}

/** Réglages finaux d'une réplique : voix du personnage + émotion. */
export function speechSettings(choice: VoiceChoice, emotion: Emotion | null) {
  const p = EMOTION_PROSODY[emotion ?? "neutre"];
  const pitchCents = choice.basePitchCents + p.pitchCents;
  // Le décalage de hauteur à la lecture accélère aussi le débit : on compense sur la durée.
  const lengthScale = +(p.lengthScale * Math.pow(2, pitchCents / 1200)).toFixed(3);
  return { lengthScale, noiseScale: p.noiseScale, pitchCents, volume: p.volume };
}
