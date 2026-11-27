import type { CampaignData, ChatMessage } from "@mj-ia/shared";
import { describe, expect, it } from "vitest";
import { collectSecrets, renderCampaignContext } from "./context";

const data: CampaignData = {
  campaign: { id: "c", name: "La Mine perdue", system: "dnd5e", mode: "ai_gm", inviteCode: "x", activeSceneId: "s1" },
  members: [
    { userId: "gm", name: "Chris", avatarUrl: null, role: "gm" },
    { userId: "alice", name: "Alice", avatarUrl: null, role: "player" },
  ],
  scenes: [
    { id: "s1", campaignId: "c", name: "Taverne", mapUrl: null, gridSize: 70, width: 20, height: 15 },
    { id: "s2", campaignId: "c", name: "Crypte", mapUrl: null, gridSize: 70, width: 10, height: 10 },
  ],
  tokens: [{ id: "t1", sceneId: "s1", name: "Gobelin", x: 3, y: 4, size: 1, color: "#000", imageUrl: null, sheetId: null, controlledBy: [], hidden: true }],
  sheets: [],
  assets: [],
  journal: [
    { id: "j1", campaignId: "c", kind: "npc", title: "Le maire", content: "Un homme affable.", gmNotes: "C'est un vampire.", visibility: "all", visibleTo: [] },
    { id: "j2", campaignId: "c", kind: "note", title: "Plan", content: "Le culte attaque à minuit.", gmNotes: null, visibility: "gm", visibleTo: [] },
  ],
};

const chat: ChatMessage[] = [
  { id: "m1", campaignId: "c", authorId: "alice", speaker: "Alice", kind: "chat", text: "J'entre dans la taverne", emotion: null, roll: null, visibility: "all", visibleTo: [], audio: null, createdAt: "" },
  { id: "m2", campaignId: "c", authorId: "alice", speaker: "Alice", kind: "chat", text: "Je vole une bourse", emotion: null, roll: null, visibility: "gm", visibleTo: [], audio: null, createdAt: "" },
];

describe("contexte de l'IA", () => {
  it("rassemble les secrets du MJ", () => {
    expect(collectSecrets(data)).toEqual(["C'est un vampire.", "Le culte attaque à minuit."]);
  });

  it("marque clairement ce qui est caché ou secret", () => {
    const text = renderCampaignContext(data, chat);
    expect(text).toContain("Taverne (id s1), grille 20×15 cases — SCÈNE ACTIVE");
    expect(text).toContain("Crypte (id s2), grille 10×10 cases — préparée, invisible des joueurs");
    expect(text).toContain("jeton « Gobelin » (id t1) en case (3, 4), taille 1 ; CACHÉ aux joueurs");
    expect(text).toContain("SECRETS DU MJ : C'est un vampire.");
    expect(text).toContain("### Plan [note, SECRET, MJ seulement]");
    expect(text).toContain("[privé, MJ seulement] Alice : Je vole une bourse");
  });
});
