/** Rôle d'un membre dans une campagne. */
export type Role = "gm" | "player" | "spectator";

/** Qui pilote la campagne. */
export type CampaignMode = "ai_gm" | "ai_assistant" | "human";

/**
 * Visibilité d'un élément (fiche, entrée de journal…).
 * - gm : MJ seulement
 * - all : tous les membres
 * - some : MJ + les utilisateurs listés dans visibleTo
 */
export type Visibility = "gm" | "all" | "some";

export interface User {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export interface Campaign {
  id: string;
  name: string;
  system: string;
  mode: CampaignMode;
  inviteCode: string;
  activeSceneId: string | null;
}

export interface Member {
  userId: string;
  name: string;
  avatarUrl: string | null;
  role: Role;
}

export interface Scene {
  id: string;
  campaignId: string;
  name: string;
  mapUrl: string | null;
  gridSize: number;
  width: number;
  height: number;
}

export interface Token {
  id: string;
  sceneId: string;
  name: string;
  x: number;
  y: number;
  size: number;
  color: string;
  imageUrl: string | null;
  sheetId: string | null;
  /** Utilisateurs autorisés à déplacer le jeton (le MJ l'est toujours). */
  controlledBy: string[];
  /** Jeton caché : seul le MJ le voit. */
  hidden: boolean;
}

export interface Sheet {
  id: string;
  campaignId: string;
  /** Joueur propriétaire (null pour un PNJ ou un monstre). */
  ownerId: string | null;
  name: string;
  system: string;
  data: Record<string, unknown>;
  visibility: Visibility;
  visibleTo: string[];
}

export type JournalKind = "place" | "npc" | "quest" | "handout" | "session" | "note";

export interface JournalEntry {
  id: string;
  campaignId: string;
  kind: JournalKind;
  title: string;
  /** Contenu montré aux joueurs qui ont accès à l'entrée. */
  content: string;
  /** Secrets du MJ : jamais envoyés à un joueur. null dans la vue joueur. */
  gmNotes: string | null;
  visibility: Visibility;
  visibleTo: string[];
}

/**
 * Fichier de la bibliothèque de la campagne.
 * - map : battle map (image) ;
 * - token : image de jeton ;
 * - document : règles, aides de jeu, PDF… lus par les joueurs autorisés.
 */
export type AssetKind = "map" | "token" | "document";

export interface Asset {
  id: string;
  campaignId: string;
  kind: AssetKind;
  name: string;
  /** Adresse du fichier. Les documents passent par une route qui vérifie les droits. */
  url: string;
  mime: string;
  size: number;
  uploadedBy: string | null;
  visibility: Visibility;
  visibleTo: string[];
}

/** Tout ce que contient une campagne, côté serveur (non filtré). */
export interface CampaignData {
  campaign: Campaign;
  members: Member[];
  scenes: Scene[];
  tokens: Token[];
  sheets: Sheet[];
  journal: JournalEntry[];
  assets: Asset[];
}

/** Ce qu'un membre reçoit : déjà filtré selon ses permissions. */
export interface CampaignView extends CampaignData {
  me: Member;
}
