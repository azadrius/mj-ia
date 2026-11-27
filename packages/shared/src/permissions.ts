import type {
  CampaignData,
  CampaignView,
  JournalEntry,
  Member,
  Scene,
  Sheet,
  Token,
} from "./types";

/**
 * Règles de visibilité. Elles sont appliquées par le serveur avant tout envoi :
 * un joueur ne reçoit jamais ce qu'il n'a pas le droit de voir.
 */

export const isGm = (me: Member) => me.role === "gm";

function visibleBy(item: { visibility: string; visibleTo: string[] }, me: Member) {
  if (isGm(me)) return true;
  if (item.visibility === "all") return true;
  if (item.visibility === "some") return item.visibleTo.includes(me.userId);
  return false;
}

export function canSeeSheet(sheet: Sheet, me: Member) {
  return sheet.ownerId === me.userId || visibleBy(sheet, me);
}

export function canEditSheet(sheet: Sheet, me: Member) {
  return isGm(me) || (me.role === "player" && sheet.ownerId === me.userId);
}

export function canSeeJournal(entry: JournalEntry, me: Member) {
  return visibleBy(entry, me);
}

/** Les joueurs ne voient que la scène active ; le MJ voit toutes les scènes. */
export function canSeeScene(scene: Scene, activeSceneId: string | null, me: Member) {
  return isGm(me) || scene.id === activeSceneId;
}

export function canSeeToken(token: Token, scene: Scene | undefined, activeSceneId: string | null, me: Member) {
  if (!scene || !canSeeScene(scene, activeSceneId, me)) return false;
  if (isGm(me)) return true;
  // Un jeton caché reste visible pour ceux qui le contrôlent (ex. personnage invisible).
  return !token.hidden || token.controlledBy.includes(me.userId);
}

export function canMoveToken(token: Token, me: Member) {
  return isGm(me) || (me.role === "player" && token.controlledBy.includes(me.userId));
}

/** Version d'une entrée de journal envoyée à ce membre (sans les secrets du MJ). */
export function journalForMember(entry: JournalEntry, me: Member): JournalEntry {
  return isGm(me) ? entry : { ...entry, gmNotes: null };
}

/** Version d'un jeton envoyée à ce membre. */
export function tokenForMember(token: Token, me: Member, visibleSheetIds: Set<string>): Token {
  if (isGm(me)) return token;
  // On n'expose pas le lien vers une fiche que le joueur ne peut pas lire.
  return {
    ...token,
    sheetId: token.sheetId && visibleSheetIds.has(token.sheetId) ? token.sheetId : null,
  };
}

/** Construit la vue filtrée d'une campagne pour un membre. */
export function buildCampaignView(data: CampaignData, me: Member): CampaignView {
  const { campaign } = data;
  const gm = isGm(me);
  const scenes = data.scenes.filter((s) => canSeeScene(s, campaign.activeSceneId, me));
  const sceneById = new Map(data.scenes.map((s) => [s.id, s]));
  const sheets = data.sheets.filter((s) => canSeeSheet(s, me));
  const sheetIds = new Set(sheets.map((s) => s.id));
  const tokens = data.tokens
    .filter((t) => canSeeToken(t, sceneById.get(t.sceneId), campaign.activeSceneId, me))
    .map((t) => tokenForMember(t, me, sheetIds));
  const journal = data.journal
    .filter((j) => canSeeJournal(j, me))
    .map((j) => journalForMember(j, me));

  return {
    me,
    // Le code d'invitation n'est utile qu'au MJ.
    campaign: gm ? campaign : { ...campaign, inviteCode: "" },
    members: data.members,
    scenes,
    tokens,
    // Les listes de visibilité ne regardent que le MJ.
    sheets: gm ? sheets : sheets.map((s) => ({ ...s, visibleTo: [] })),
    journal: gm ? journal : journal.map((j) => ({ ...j, visibleTo: [] })),
  };
}
