import { describe, expect, it } from "vitest";
import { canSeeMessage, findLeakedSecret, parseChatCommand, type ChatMessage } from "./chat";
import { describeRoll, parseDice, rollDice } from "./dice";
import type { Member } from "./types";

const gm: Member = { userId: "gm", name: "MJ", avatarUrl: null, role: "gm" };
const alice: Member = { userId: "alice", name: "Alice", avatarUrl: null, role: "player" };
const jp: Member = { userId: "jp", name: "Jean Pierre", avatarUrl: null, role: "player" };
const bob: Member = { userId: "bob", name: "Bob", avatarUrl: null, role: "player" };

describe("dés", () => {
  const fixed = (...values: number[]) => {
    let i = 0;
    return () => values[i++ % values.length];
  };

  it("lit les formules courantes", () => {
    expect(parseDice("1d20+5")).toEqual({ dice: [{ sign: 1, count: 1, sides: 20 }], modifier: 5 });
    expect(parseDice("d6 - 1").dice[0]).toEqual({ sign: 1, count: 1, sides: 6 });
    expect(parseDice("2d20kh1").dice[0].keep).toEqual({ mode: "kh", n: 1 });
  });

  it("refuse les formules invalides", () => {
    expect(() => parseDice("abc")).toThrow();
    expect(() => parseDice("1000d6")).toThrow();
    expect(() => parseDice("2d20kh3")).toThrow();
  });

  it("calcule le total, avec avantage", () => {
    // random 0.5 sur un d20 → 11 ; 0.95 → 20
    const roll = rollDice("2d20kh1+3", fixed(0.5, 0.95));
    expect(roll.groups[0].rolls).toEqual([11, 20]);
    expect(roll.groups[0].kept).toEqual([20]);
    expect(roll.total).toBe(23);
    expect(describeRoll(roll)).toBe("2d20kh1+3 → [11, 20 → 20] + 3 = 23");
    expect(rollDice("4d6kl1-2", fixed(0, 0.99, 0.5, 0.5)).total).toBe(-1);
  });
});

describe("commandes du chat", () => {
  const members = [gm, alice, jp, bob];
  it("reconnaît les commandes", () => {
    expect(parseChatCommand("Bonjour", members)).toEqual({ type: "say", text: "Bonjour" });
    expect(parseChatCommand("/r 1d20+2", members)).toEqual({ type: "roll", formula: "1d20+2", secret: false });
    expect(parseChatCommand("/gr", members)).toEqual({ type: "roll", formula: "1d20", secret: true });
    expect(parseChatCommand("/mj je vole la bourse", members)).toEqual({ type: "to_gm", text: "je vole la bourse" });
    expect(parseChatCommand("/w Jean Pierre psst", members)).toMatchObject({ type: "whisper", to: { userId: "jp" }, text: "psst" });
    expect(() => parseChatCommand("/w Personne salut", members)).toThrow();
    expect(() => parseChatCommand("/xyz", members)).toThrow();
  });
});

describe("visibilité des messages", () => {
  const msg = (m: Partial<ChatMessage>): ChatMessage => ({
    id: "m", campaignId: "c", authorId: null, speaker: "", kind: "chat", text: "", emotion: null,
    roll: null, visibility: "all", visibleTo: [], audio: null, createdAt: "", ...m,
  });
  it("chuchotements et messages au MJ", () => {
    const whisper = msg({ authorId: "alice", visibility: "some", visibleTo: ["bob"] });
    expect(canSeeMessage(whisper, alice)).toBe(true);
    expect(canSeeMessage(whisper, bob)).toBe(true);
    expect(canSeeMessage(whisper, jp)).toBe(false);
    expect(canSeeMessage(whisper, gm)).toBe(true);
    const secretRoll = msg({ authorId: null, visibility: "gm" });
    expect(canSeeMessage(secretRoll, alice)).toBe(false);
  });
});

describe("garde-fou des secrets", () => {
  const secrets = ["Le maire Harbin est en réalité un vampire. Il cache la clé sous l'autel."];
  it("bloque une phrase secrète recopiée", () => {
    expect(findLeakedSecret("Vous apprenez que le maire HARBIN est en realite un vampire !", secrets)).toContain("vampire");
  });
  it("laisse passer une narration normale", () => {
    expect(findLeakedSecret("Le maire vous accueille avec un sourire pâle.", secrets)).toBeNull();
  });
});
