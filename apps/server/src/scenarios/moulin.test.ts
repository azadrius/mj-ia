import { existsSync } from "node:fs";
import { dnd5eSheetSchema } from "@mj-ia/shared";
import { describe, expect, it } from "vitest";
import { SCENARIOS } from "./moulin";

describe.each(Object.values(SCENARIOS))("scénario $id", (scenario) => {
  it("a des fiches D&D 5e valides et un seul PJ prétiré", () => {
    for (const s of scenario.sheets) expect(dnd5eSheetSchema.safeParse(s.data).success, s.name).toBe(true);
    expect(scenario.sheets.filter((s) => s.pc)).toHaveLength(1);
  });

  it("place les jetons sur la carte et les relie à des fiches existantes", () => {
    const keys = new Set(scenario.sheets.map((s) => s.key));
    for (const scene of scenario.scenes) {
      expect(existsSync(new URL(`./assets/${scene.map}`, import.meta.url)), scene.map).toBe(true);
      for (const t of scene.tokens) {
        expect(t.x).toBeGreaterThanOrEqual(0);
        expect(t.x).toBeLessThan(scene.width);
        expect(t.y).toBeGreaterThanOrEqual(0);
        expect(t.y).toBeLessThan(scene.height);
        if (t.sheet) expect(keys.has(t.sheet), t.name).toBe(true);
      }
    }
    expect(scenario.scenes.some((s) => s.key === scenario.activeScene)).toBe(true);
  });

  it("garde les secrets hors de ce que voit le joueur", () => {
    const publicText = scenario.journal.filter((j) => j.visibility === "all").map((j) => j.content).join("\n");
    expect(publicText).not.toMatch(/Skrell|tunnel|pierre-lune|dette|doit/i);
  });
});
