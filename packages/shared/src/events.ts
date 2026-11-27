import type { Token } from "./types";

/** Messages temps réel (Socket.IO) entre le navigateur et le serveur. */
export interface ServerToClientEvents {
  /** Un jeton a été créé ou modifié (déjà filtré pour ce membre). */
  "token:upsert": (token: Token) => void;
  /** Le jeton n'existe plus, ou ce membre ne doit plus le voir. */
  "token:remove": (tokenId: string) => void;
  /** Autre changement (scène, fiche, journal…) : le client recharge sa vue. */
  "campaign:changed": () => void;
  error: (message: string) => void;
}

export interface ClientToServerEvents {
  "campaign:join": (campaignId: string, ack: (ok: boolean) => void) => void;
  "token:move": (move: { tokenId: string; x: number; y: number }) => void;
}
