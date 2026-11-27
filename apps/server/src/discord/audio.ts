/**
 * Conversion d'un WAV de Piper (PCM 16 bits, mono, 16 à 22 kHz) vers le format
 * attendu par Discord (PCM 16 bits, stéréo, 48 kHz), en appliquant au passage
 * le décalage de hauteur et le volume de la réplique.
 */

export interface WavInfo {
  sampleRate: number;
  channels: number;
  samples: Int16Array; // entrelacés si plusieurs canaux
}

export function parseWav(buffer: Buffer): WavInfo {
  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("Fichier WAV invalide");
  }
  let offset = 12;
  let sampleRate = 0;
  let channels = 0;
  let bits = 0;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === "fmt ") {
      const format = buffer.readUInt16LE(body);
      channels = buffer.readUInt16LE(body + 2);
      sampleRate = buffer.readUInt32LE(body + 4);
      bits = buffer.readUInt16LE(body + 14);
      if (format !== 1 || bits !== 16) throw new Error("Seul le PCM 16 bits est pris en charge");
    } else if (id === "data") {
      if (!sampleRate) throw new Error("WAV sans en-tête fmt");
      // Piper en flux peut annoncer une taille de données inexacte : on borne au fichier.
      const end = Math.min(body + size, buffer.length);
      const count = Math.floor((end - body) / 2);
      const samples = new Int16Array(count);
      for (let i = 0; i < count; i++) samples[i] = buffer.readInt16LE(body + i * 2);
      return { sampleRate, channels, samples };
    }
    offset = body + size + (size % 2);
  }
  throw new Error("WAV sans données audio");
}

export const DISCORD_RATE = 48_000;

export function toDiscordPcm(wav: WavInfo, pitchCents = 0, volume = 1): Buffer {
  const frames = Math.floor(wav.samples.length / wav.channels);
  // Lire plus vite élève la voix : c'est le même effet que le « detune » du navigateur.
  const rate = Math.pow(2, pitchCents / 1200);
  const step = (wav.sampleRate * rate) / DISCORD_RATE;
  const outFrames = Math.max(0, Math.floor((frames - 1) / step));
  const out = Buffer.alloc(outFrames * 4);
  const mono = (frame: number) => {
    let sum = 0;
    for (let c = 0; c < wav.channels; c++) sum += wav.samples[frame * wav.channels + c];
    return sum / wav.channels;
  };
  for (let i = 0; i < outFrames; i++) {
    const pos = i * step;
    const i0 = Math.floor(pos);
    const frac = pos - i0;
    const a = mono(i0);
    const b = i0 + 1 < frames ? mono(i0 + 1) : a;
    const value = Math.max(-32768, Math.min(32767, Math.round((a + (b - a) * frac) * volume)));
    out.writeInt16LE(value, i * 4);
    out.writeInt16LE(value, i * 4 + 2);
  }
  return out;
}

/** Fréquence attendue par Whisper. */
export const STT_RATE = 16_000;

/**
 * Voix d'un joueur reçue de Discord (PCM 16 bits, stéréo, 48 kHz) vers du
 * mono 16 kHz pour Whisper : moyenne des canaux puis moyenne de 3 échantillons.
 */
export function discordPcmToMono16k(pcm: Buffer): Int16Array {
  const frames = Math.floor(pcm.length / 4);
  const factor = DISCORD_RATE / STT_RATE; // 3
  const out = new Int16Array(Math.floor(frames / factor));
  for (let i = 0; i < out.length; i++) {
    let sum = 0;
    for (let k = 0; k < factor; k++) {
      const f = (i * factor + k) * 4;
      sum += pcm.readInt16LE(f) + pcm.readInt16LE(f + 2);
    }
    out[i] = Math.round(sum / (factor * 2));
  }
  return out;
}

/** Encapsule du PCM 16 bits mono dans un fichier WAV. */
export function encodeWav(samples: Int16Array, sampleRate: number): Buffer {
  const data = samples.length * 2;
  const buf = Buffer.alloc(44 + data);
  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(36 + data, 4);
  buf.write("WAVE", 8, "ascii");
  buf.write("fmt ", 12, "ascii");
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36, "ascii");
  buf.writeUInt32LE(data, 40);
  for (let i = 0; i < samples.length; i++) buf.writeInt16LE(samples[i], 44 + i * 2);
  return buf;
}

/** Niveau sonore moyen (RMS, 0 à 32768) : sert à jeter les clics et les souffles. */
export function rms(samples: Int16Array): number {
  if (!samples.length) return 0;
  let sum = 0;
  for (const s of samples) sum += s * s;
  return Math.sqrt(sum / samples.length);
}
