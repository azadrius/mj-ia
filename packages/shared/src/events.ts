import type { ChatMessage } from "./chat";
import type { Token } from "./types";

/** Messages temps réel (Socket.IO) entre le navigateur et le serveur. */
export interface ServerToClientEvents {
  /** Un jeton a été créé ou modifié (déjà filtré pour ce membre). */
  "token:upsert": (token: Token) => void;
  /** Le jeton n'existe plus, ou ce membre ne doit plus le voir. */
  "token:remove": (tokenId: string) => void;
  /** Autre changement (scène, fiche, journal…) : le client recharge sa vue. */
  "campaign:changed": () => void;
  /** Nouveau message de chat (déjà filtré pour ce membre). */
  "chat:message": (message: ChatMessage) => void;
  /** L'IA réfléchit (true) ou a fini (false). */
  "ai:busy": (busy: boolean) => void;
  error: (message: string) => void;
}

export interface ClientToServerEvents {
  "campaign:join": (campaignId: string, ack: (ok: boolean) => void) => void;
  "token:move": (move: { tokenId: string; x: number; y: number }) => void;
  /** Texte libre ou commande : /r 1d20+5, /gr 1d20 (jet secret), /w Nom texte, /mj texte, /ia texte. */
  "chat:send": (text: string) => void;
}
