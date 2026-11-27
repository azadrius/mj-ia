import type { ChatMessage } from "@mj-ia/shared";
import { describe, expect, it } from "vitest";
import { formatForDiscord } from "./format";

const msg = (m: Partial<ChatMessage>): ChatMessage => ({
  id: "m", campaignId: "c", authorId: null, speaker: "Narrateur", kind: "narration", text: "", emotion: null,
  roll: null, visibility: "all", visibleTo: [], audio: null, createdAt: "", ...m,
});

describe("messages vers Discord", () => {
  it("met en forme narration, PNJ et jets", () => {
    expect(formatForDiscord(msg({ text: "La porte grince." }))).toBe("📜 *La porte grince.*");
    expect(formatForDiscord(msg({ kind: "npc", speaker: "Grimbold", emotion: "colère", text: "Dehors !" }))).toBe("🎭 **Grimbold** *(colère)* : Dehors !");
    expect(formatForDiscord(msg({ kind: "roll", speaker: "Alice", text: "1d20 → [12] = 12", roll: { formula: "1d20", groups: [], modifier: 0, total: 12 } }))).toBe("🎲 **Alice** : **12**  1d20 → [12] = 12");
  });

  it("neutralise les mentions et la mise en forme venues de la table", () => {
    const out = formatForDiscord(msg({ kind: "chat", speaker: "Bob", text: "@everyone *gras*" }));
    expect(out).not.toContain("@everyone");
    expect(out).toContain("\\*gras\\*");
  });
});
