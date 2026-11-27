import { describe, expect, it } from "vitest";
import { pickVoice, speechSettings, type VoiceOption } from "./voice";

const voices: VoiceOption[] = [
  { model: "fr_FR-siwis-medium", speakerId: null },
  { model: "fr_FR-gilles-low", speakerId: null },
  { model: "fr_FR-upmc-medium", speakerId: 0 },
  { model: "fr_FR-upmc-medium", speakerId: 1 },
];
const narrator = voices[0];

describe("choix des voix", () => {
  it("le narrateur garde sa voix", () => {
    expect(pickVoice("Narrateur", voices, narrator)).toMatchObject({ model: "fr_FR-siwis-medium", basePitchCents: 0 });
  });

  it("un PNJ a toujours la même voix, différente du narrateur", () => {
    const a = pickVoice("Grimbold le forgeron", voices, narrator);
    expect(pickVoice("  grimbold le FORGERON ", voices, narrator)).toEqual(a);
    for (const name of ["Grimbold", "Sildar", "Le maire", "Gobelin", "Glasstaff", "Reidoth"]) {
      expect(pickVoice(name, voices, narrator)?.model).not.toBe(narrator.model);
    }
  });

  it("répartit les PNJ entre plusieurs voix", () => {
    const names = ["Grimbold", "Sildar", "Le maire", "Gobelin", "Glasstaff", "Reidoth", "Toblen", "Qelline", "Halia", "Nezznar"];
    const distinct = new Set(names.map((n) => JSON.stringify(pickVoice(n, voices, narrator))));
    expect(distinct.size).toBeGreaterThanOrEqual(5);
  });

  it("sans voix, pas de synthèse", () => {
    expect(pickVoice("Narrateur", [], null)).toBeNull();
  });
});

describe("émotions", () => {
  it("compense le débit quand la voix est plus aiguë", () => {
    const s = speechSettings({ model: "m", speakerId: null, basePitchCents: 0 }, "surprise");
    expect(s.pitchCents).toBe(200);
    // 0,9 × 2^(200/1200) ≈ 1,01 : le débit final reste proche de 0,9
    expect(s.lengthScale).toBeCloseTo(1.01, 2);
    expect(speechSettings({ model: "m", speakerId: null, basePitchCents: -250 }, null).pitchCents).toBe(-250);
  });
});
