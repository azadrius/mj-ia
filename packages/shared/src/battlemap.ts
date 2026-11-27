/**
 * Import de battle maps.
 * - Image simple : on déduit la grille de la taille de l'image et du nombre de pixels par case.
 * - Universal VTT (.dd2vtt, .uvtt, .df2vtt : Dungeondraft, Dungeon Alchemist, DungeonFog…) :
 *   un JSON qui contient l'image en base64 et la taille de la grille.
 */

export const MAP_FILE_EXTENSIONS = [".dd2vtt", ".uvtt", ".df2vtt"];
export const MAX_MAP_CELLS = 200;

export function isUniversalVttFile(name: string) {
  const lower = name.toLowerCase();
  return MAP_FILE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/** Nombre de cases d'une image, arrondi, entre 1 et MAX_MAP_CELLS. */
export function gridFromImage(widthPx: number, heightPx: number, pixelsPerCell: number) {
  const cells = (px: number) => Math.min(MAX_MAP_CELLS, Math.max(1, Math.round(px / Math.max(1, pixelsPerCell))));
  return { width: cells(widthPx), height: cells(heightPx) };
}

export interface UniversalVttMap {
  width: number;
  height: number;
  pixelsPerCell: number;
  /** Image en base64, sans préfixe data:. */
  imageBase64: string;
  mime: "image/png" | "image/webp" | "image/jpeg";
}

/** Lit un fichier Universal VTT. Lève une erreur en français si le fichier est inutilisable. */
export function parseUniversalVtt(json: unknown): UniversalVttMap {
  const data = json as {
    resolution?: { map_size?: { x?: number; y?: number }; pixels_per_grid?: number };
    image?: string;
  };
  const size = data?.resolution?.map_size;
  const width = Math.round(Number(size?.x));
  const height = Math.round(Number(size?.y));
  if (!(width > 0 && height > 0)) throw new Error("Fichier VTT sans taille de carte (resolution.map_size)");
  if (typeof data.image !== "string" || data.image.length < 16) throw new Error("Fichier VTT sans image");
  const imageBase64 = data.image.replace(/^data:[^;]+;base64,/, "");
  return {
    width: Math.min(MAX_MAP_CELLS, width),
    height: Math.min(MAX_MAP_CELLS, height),
    pixelsPerCell: Number(data.resolution?.pixels_per_grid) || 0,
    imageBase64,
    mime: sniffImage(imageBase64),
  };
}

/** Format d'une image en base64, d'après ses premiers octets. */
function sniffImage(b64: string): UniversalVttMap["mime"] {
  if (b64.startsWith("iVBOR")) return "image/png";
  if (b64.startsWith("/9j/")) return "image/jpeg";
  if (b64.startsWith("UklGR")) return "image/webp";
  throw new Error("Image du fichier VTT dans un format inconnu (PNG, JPEG ou WEBP attendu)");
}
