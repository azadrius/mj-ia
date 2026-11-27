import { z } from "zod";

export const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"] as const;
export type Ability = (typeof ABILITIES)[number];

export const ABILITY_LABELS: Record<Ability, string> = {
  str: "Force",
  dex: "Dextérité",
  con: "Constitution",
  int: "Intelligence",
  wis: "Sagesse",
  cha: "Charisme",
};

const score = z.number().int().min(1).max(30);

/** Fiche D&D 5e minimale. Elle s'enrichira (sorts, inventaire…) au fil des étapes. */
export const dnd5eSheetSchema = z.object({
  kind: z.enum(["pc", "npc", "monster"]).default("pc"),
  race: z.string().default(""),
  class: z.string().default(""),
  level: z.number().int().min(0).max(30).default(1),
  ac: z.number().int().min(0).max(50).default(10),
  speed: z.number().int().min(0).default(30),
  hp: z
    .object({ current: z.number().int(), max: z.number().int().min(0) })
    .default({ current: 10, max: 10 }),
  abilities: z
    .object({ str: score, dex: score, con: score, int: score, wis: score, cha: score })
    .default({ str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }),
  notes: z.string().default(""),
});

export type Dnd5eSheet = z.infer<typeof dnd5eSheetSchema>;

export const abilityModifier = (value: number) => Math.floor((value - 10) / 2);

export const proficiencyBonus = (level: number) => Math.max(2, Math.ceil(level / 4) + 1);
