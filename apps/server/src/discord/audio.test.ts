import { describe, expect, it } from "vitest";
import { DISCORD_RATE, parseWav, toDiscordPcm } from "./audio";

function makeWav(samples: number[], sampleRate: number) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((s, i) => data.writeInt16LE(s, i * 2));
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

describe("audio pour Discord", () => {
  const second = Array.from({ length: 16_000 }, (_, i) => Math.round(Math.sin(i / 10) * 10_000));
  const wav = parseWav(makeWav(second, 16_000));

  it("lit l'en-tête WAV de Piper", () => {
    expect(wav).toMatchObject({ sampleRate: 16_000, channels: 1 });
    expect(wav.samples.length).toBe(16_000);
    expect(() => parseWav(Buffer.from("pas un wav"))).toThrow();
  });

  it("passe en stéréo 48 kHz sans changer la durée", () => {
    const pcm = toDiscordPcm(wav);
    const frames = pcm.length / 4;
    expect(Math.abs(frames - DISCORD_RATE)).toBeLessThan(10);
    // Les deux canaux sont identiques
    expect(pcm.readInt16LE(400)).toBe(pcm.readInt16LE(402));
  });

  it("une voix plus aiguë est aussi plus courte, comme dans le navigateur", () => {
    const octaveUp = toDiscordPcm(wav, 1200).length / 4;
    expect(Math.abs(octaveUp - DISCORD_RATE / 2)).toBeLessThan(10);
  });

  it("applique le volume sans saturer", () => {
    const loud = parseWav(makeWav([30_000, -30_000, 30_000], 48_000));
    const pcm = toDiscordPcm(loud, 0, 2);
    expect(pcm.readInt16LE(0)).toBe(32767);
    expect(pcm.readInt16LE(4)).toBe(-32768);
  });
});
