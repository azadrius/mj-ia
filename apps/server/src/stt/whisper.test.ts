import { describe, expect, it } from "vitest";
import { cleanTranscript } from "./whisper";

describe("cleanTranscript", () => {
  it("garde la phrase du joueur, espaces nettoyés", () => {
    expect(cleanTranscript("  J'ouvre   la porte. ")).toBe("J'ouvre la porte.");
  });
  it("jette les phrases que Whisper invente sur le silence", () => {
    expect(cleanTranscript("Sous-titrage ST' 501")).toBe("");
    expect(cleanTranscript("Merci d'avoir regardé cette vidéo !")).toBe("");
    expect(cleanTranscript("...")).toBe("");
    expect(cleanTranscript("")).toBe("");
  });
});
