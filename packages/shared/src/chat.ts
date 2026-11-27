import type { DiceRoll } from "./dice";
import { isGm } from "./permissions";
import type { Member, Visibility } from "./types";

/**
 * Émotions avec lesquelles l'IA fait parler un personnage.
 * L'étape 3 (voix) s'en servira pour choisir l'intonation.
 */
export const EMOTIONS = [
  "neutre",
  "joie",
  "colère",
  "peur",
  "tristesse",
  "surprise",
  "dégoût",
  "menace",
  "mystère",
  "moquerie",
  "solennel",
  "chuchoté",
] as const;
export type Emotion = (typeof EMOTIONS)[number];

export type ChatKind =
  | "chat" // message d'un membre
  | "roll" // jet de dés
  | "narration" // narration du MJ IA
  | "npc" // réplique d'un PNJ joué par l'IA
  | "ai_hint" // conseil de l'IA au MJ humain
  | "system";

export interface ChatMessage {
  id: string;
  campaignId: string;
  /** Membre auteur ; null pour l'IA ou le système. */
  authorId: string | null;
  /** Nom affiché : joueur, PNJ, « Narrateur »… */
  speaker: string;
  kind: ChatKind;
  text: string;
  emotion: Emotion | null;
  roll: DiceRoll | null;
  visibility: Visibility;
  visibleTo: string[];
  createdAt: string;
}

export function canSeeMessage(message: ChatMessage, me: Member) {
  if (isGm(me) || message.authorId === me.userId) return true;
  if (message.visibility === "all") return true;
  if (message.visibility === "some") return message.visibleTo.includes(me.userId);
  return false;
}

export function messageForMember(message: ChatMessage, me: Member): ChatMessage {
  return isGm(me) ? message : { ...message, visibleTo: message.visibleTo.filter((id) => id === me.userId) };
}

/**
 * Garde-fou : repère si un texte destiné aux joueurs recopie un secret du MJ.
 * On compare des phrases d'au moins `minLength` caractères, sans tenir compte
 * de la casse, de la ponctuation ni des espaces.
 */
export function findLeakedSecret(text: string, secrets: string[], minLength = 25): string | null {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  const haystack = norm(text);
  for (const secret of secrets) {
    for (const sentence of secret.split(/[.!?\n;]+/)) {
      const needle = norm(sentence);
      if (needle.length >= minLength && haystack.includes(needle)) return sentence.trim();
    }
  }
  return null;
}

export type ChatCommand =
  | { type: "say"; text: string }
  | { type: "roll"; formula: string; secret: boolean }
  | { type: "whisper"; to: Member; text: string }
  | { type: "to_gm"; text: string }
  | { type: "ai"; text: string };

/** Interprète une ligne tapée dans le chat. */
export function parseChatCommand(input: string, members: Member[]): ChatCommand {
  const text = input.trim();
  const m = text.match(/^\/(\w+)\s*([\s\S]*)$/);
  if (!m) return { type: "say", text };
  const [, cmd, rest] = m;
  switch (cmd.toLowerCase()) {
    case "r":
    case "roll":
      return { type: "roll", formula: rest || "1d20", secret: false };
    case "gr":
      return { type: "roll", formula: rest || "1d20", secret: true };
    case "mj":
    case "gm":
      if (!rest) throw new Error("Usage : /mj ton message");
      return { type: "to_gm", text: rest };
    case "ia":
    case "ai":
      if (!rest) throw new Error("Usage : /ia ta question");
      return { type: "ai", text: rest };
    case "w": {
      // Le nom le plus long qui correspond gagne (« Jean Pierre » avant « Jean »).
      const target = [...members]
        .sort((a, b) => b.name.length - a.name.length)
        .find((mb) => rest.toLowerCase().startsWith(mb.name.toLowerCase() + " "));
      if (!target) throw new Error("Usage : /w NomDuJoueur ton message");
      return { type: "whisper", to: target, text: rest.slice(target.name.length).trim() };
    }
    default:
      throw new Error(`Commande inconnue : /${cmd}. Commandes : /r, /gr, /w, /mj, /ia`);
  }
}
