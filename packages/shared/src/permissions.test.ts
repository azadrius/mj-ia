import { describe, expect, it } from "vitest";
import { buildCampaignView, canMoveToken } from "./permissions";
import type { CampaignData, Member, Token } from "./types";

const gm: Member = { userId: "gm", name: "MJ", avatarUrl: null, role: "gm" };
const alice: Member = { userId: "alice", name: "Alice", avatarUrl: null, role: "player" };
const bob: Member = { userId: "bob", name: "Bob", avatarUrl: null, role: "player" };
const spectator: Member = { userId: "spec", name: "Spec", avatarUrl: null, role: "spectator" };

const token = (t: Partial<Token>): Token => ({
  id: "t", sceneId: "s1", name: "", x: 0, y: 0, size: 1, color: "#000",
  imageUrl: null, sheetId: null, controlledBy: [], hidden: false, ...t,
});

const data: CampaignData = {
  campaign: { id: "c", name: "C", system: "dnd5e", mode: "human", inviteCode: "SECRET", activeSceneId: "s1" },
  members: [gm, alice, bob],
  scenes: [
    { id: "s1", campaignId: "c", name: "Taverne", mapUrl: null, gridSize: 70, width: 20, height: 15 },
    { id: "s2", campaignId: "c", name: "Repaire du dragon", mapUrl: null, gridSize: 70, width: 20, height: 15 },
  ],
  tokens: [
    token({ id: "alice-pc", controlledBy: ["alice"], sheetId: "sheet-alice" }),
    token({ id: "goblin", hidden: true, sheetId: "sheet-goblin" }),
    token({ id: "innkeeper", sheetId: "sheet-goblin" }),
    token({ id: "invisible-alice", hidden: true, controlledBy: ["alice"] }),
    token({ id: "dragon", sceneId: "s2" }),
  ],
  sheets: [
    { id: "sheet-alice", campaignId: "c", ownerId: "alice", name: "Elara", system: "dnd5e", data: {}, visibility: "gm", visibleTo: [] },
    { id: "sheet-goblin", campaignId: "c", ownerId: null, name: "Gobelin", system: "dnd5e", data: {}, visibility: "gm", visibleTo: [] },
    { id: "sheet-shared", campaignId: "c", ownerId: null, name: "Allié", system: "dnd5e", data: {}, visibility: "some", visibleTo: ["bob"] },
  ],
  journal: [
    { id: "j-public", campaignId: "c", kind: "place", title: "Village", content: "Calme", gmNotes: "Le maire est un vampire", visibility: "all", visibleTo: [] },
    { id: "j-secret", campaignId: "c", kind: "note", title: "Plan du méchant", content: "…", gmNotes: "…", visibility: "gm", visibleTo: [] },
    { id: "j-bob", campaignId: "c", kind: "handout", title: "Lettre pour Bob", content: "…", gmNotes: null, visibility: "some", visibleTo: ["bob"] },
  ],
};

const ids = (items: { id: string }[]) => items.map((i) => i.id).sort();

describe("vue du MJ", () => {
  const view = buildCampaignView(data, gm);
  it("voit tout, secrets compris", () => {
    expect(ids(view.scenes)).toEqual(["s1", "s2"]);
    expect(view.tokens).toHaveLength(5);
    expect(view.sheets).toHaveLength(3);
    expect(view.journal.find((j) => j.id === "j-public")?.gmNotes).toBe("Le maire est un vampire");
    expect(view.campaign.inviteCode).toBe("SECRET");
  });
});

describe("vue d'un joueur", () => {
  const view = buildCampaignView(data, alice);

  it("ne voit que la scène active et ses jetons visibles", () => {
    expect(ids(view.scenes)).toEqual(["s1"]);
    expect(ids(view.tokens)).toEqual(["alice-pc", "innkeeper", "invisible-alice"]);
  });

  it("ne voit que sa fiche et celles partagées avec lui", () => {
    expect(ids(view.sheets)).toEqual(["sheet-alice"]);
    expect(ids(buildCampaignView(data, bob).sheets)).toEqual(["sheet-shared"]);
  });

  it("ne reçoit jamais les secrets du MJ", () => {
    expect(ids(view.journal)).toEqual(["j-public"]);
    expect(view.journal[0].gmNotes).toBeNull();
    expect(view.campaign.inviteCode).toBe("");
    expect(JSON.stringify(view)).not.toContain("vampire");
  });

  it("ne voit pas le lien vers une fiche cachée", () => {
    expect(view.tokens.find((t) => t.id === "innkeeper")?.sheetId).toBeNull();
    expect(view.tokens.find((t) => t.id === "alice-pc")?.sheetId).toBe("sheet-alice");
  });

  it("le spectateur voit la même chose qu'un joueur sans fiche", () => {
    expect(ids(buildCampaignView(data, spectator).journal)).toEqual(["j-public"]);
  });
});

describe("déplacement des jetons", () => {
  const pc = data.tokens[0];
  it("le MJ déplace tout, un joueur seulement ses jetons", () => {
    expect(canMoveToken(pc, gm)).toBe(true);
    expect(canMoveToken(pc, alice)).toBe(true);
    expect(canMoveToken(pc, bob)).toBe(false);
    expect(canMoveToken(token({ controlledBy: ["spec"] }), spectator)).toBe(false);
  });
});
