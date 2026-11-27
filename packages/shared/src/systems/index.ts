import type { z } from "zod";
import { dnd5eSheetSchema } from "./dnd5e";

/**
 * Registre des systèmes de jeu. Pour ajouter un JDR, on déclare ici
 * le schéma de sa fiche ; le reste de l'appli ne dépend pas du système.
 */
export interface GameSystem {
  id: string;
  name: string;
  sheetSchema: z.ZodType<Record<string, unknown>>;
}

export const SYSTEMS: Record<string, GameSystem> = {
  dnd5e: { id: "dnd5e", name: "Donjons & Dragons 5e", sheetSchema: dnd5eSheetSchema },
};

export function getSystem(id: string): GameSystem {
  const system = SYSTEMS[id];
  if (!system) throw new Error(`Système de jeu inconnu : ${id}`);
  return system;
}
