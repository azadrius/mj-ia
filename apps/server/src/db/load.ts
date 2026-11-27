import type { CampaignData, Member, Scene, Token } from "@mj-ia/shared";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "./client";
import { campaigns, journalEntries, members, scenes, sheets, tokens, users } from "./schema";

export async function loadMembers(campaignId: string): Promise<Member[]> {
  const rows = await db
    .select({ userId: members.userId, role: members.role, name: users.name, avatarUrl: users.avatarUrl })
    .from(members)
    .innerJoin(users, eq(users.id, members.userId))
    .where(eq(members.campaignId, campaignId))
    .orderBy(asc(users.name));
  return rows;
}

export async function loadMember(campaignId: string, userId: string): Promise<Member | null> {
  const [row] = await db
    .select({ userId: members.userId, role: members.role, name: users.name, avatarUrl: users.avatarUrl })
    .from(members)
    .innerJoin(users, eq(users.id, members.userId))
    .where(and(eq(members.campaignId, campaignId), eq(members.userId, userId)));
  return row ?? null;
}

const toScene = (s: typeof scenes.$inferSelect): Scene => ({
  id: s.id, campaignId: s.campaignId, name: s.name, mapUrl: s.mapUrl,
  gridSize: s.gridSize, width: s.width, height: s.height,
});

export const toToken = (t: typeof tokens.$inferSelect): Token => ({
  id: t.id, sceneId: t.sceneId, name: t.name, x: t.x, y: t.y, size: t.size, color: t.color,
  imageUrl: t.imageUrl, sheetId: t.sheetId, controlledBy: t.controlledBy, hidden: t.hidden,
});

/** Charge toute la campagne, sans filtre. À passer dans buildCampaignView avant envoi. */
export async function loadCampaignData(campaignId: string): Promise<CampaignData | null> {
  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId));
  if (!campaign) return null;

  const sceneRows = await db.select().from(scenes).where(eq(scenes.campaignId, campaignId)).orderBy(asc(scenes.createdAt));
  const sceneIds = sceneRows.map((s) => s.id);
  const [memberRows, tokenRows, sheetRows, journalRows] = await Promise.all([
    loadMembers(campaignId),
    sceneIds.length ? db.select().from(tokens).where(inArray(tokens.sceneId, sceneIds)) : Promise.resolve([]),
    db.select().from(sheets).where(eq(sheets.campaignId, campaignId)).orderBy(asc(sheets.name)),
    db.select().from(journalEntries).where(eq(journalEntries.campaignId, campaignId)).orderBy(asc(journalEntries.createdAt)),
  ]);

  return {
    campaign: {
      id: campaign.id, name: campaign.name, system: campaign.system, mode: campaign.mode,
      inviteCode: campaign.inviteCode, activeSceneId: campaign.activeSceneId,
    },
    members: memberRows,
    scenes: sceneRows.map(toScene),
    tokens: tokenRows.map(toToken),
    sheets: sheetRows.map((s) => ({
      id: s.id, campaignId: s.campaignId, ownerId: s.ownerId, name: s.name, system: s.system,
      data: s.data, visibility: s.visibility, visibleTo: s.visibleTo,
    })),
    journal: journalRows.map((j) => ({
      id: j.id, campaignId: j.campaignId, kind: j.kind, title: j.title, content: j.content,
      gmNotes: j.gmNotes, visibility: j.visibility, visibleTo: j.visibleTo,
    })),
  };
}
