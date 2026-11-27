import { describe, expect, it } from "vitest";
import { gridFromImage, isUniversalVttFile, parseUniversalVtt } from "./battlemap";

describe("battle maps", () => {
  it("déduit la grille d'une image", () => {
    expect(gridFromImage(2800, 2100, 140)).toEqual({ width: 20, height: 15 });
    expect(gridFromImage(1000, 700, 70)).toEqual({ width: 14, height: 10 });
    expect(gridFromImage(10, 10, 140)).toEqual({ width: 1, height: 1 });
    expect(gridFromImage(100000, 70, 70).width).toBe(200);
  });

  it("reconnaît les fichiers Universal VTT", () => {
    expect(isUniversalVttFile("Crypte.dd2vtt")).toBe(true);
    expect(isUniversalVttFile("map.UVTT")).toBe(true);
    expect(isUniversalVttFile("map.png")).toBe(false);
  });

  it("lit un fichier Universal VTT", () => {
    const map = parseUniversalVtt({
      format: 0.3,
      resolution: { map_origin: { x: 0, y: 0 }, map_size: { x: 24, y: 18 }, pixels_per_grid: 256 },
      line_of_sight: [],
      image: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB",
    });
    expect(map).toMatchObject({ width: 24, height: 18, pixelsPerCell: 256, mime: "image/png" });
  });

  it("refuse un fichier incomplet", () => {
    expect(() => parseUniversalVtt({ image: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB" })).toThrow(/taille/);
    expect(() => parseUniversalVtt({ resolution: { map_size: { x: 5, y: 5 } } })).toThrow(/image/);
  });
});
