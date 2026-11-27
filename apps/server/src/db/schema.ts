import { boolean, integer, jsonb, pgTable, primaryKey, real, text, timestamp } from "drizzle-orm/pg-core";

const id = () => text("id").primaryKey().$defaultFn(() => crypto.randomUUID());
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const users = pgTable("users", {
  id: id(),
  discordId: text("discord_id").unique(),
  name: text("name").notNull(),
  avatarUrl: text("avatar_url"),
  createdAt: createdAt(),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const campaigns = pgTable("campaigns", {
  id: id(),
  name: text("name").notNull(),
  system: text("system").notNull().default("dnd5e"),
  mode: text("mode", { enum: ["ai_gm", "ai_assistant", "human"] }).notNull().default("human"),
  inviteCode: text("invite_code").notNull().unique(),
  activeSceneId: text("active_scene_id"),
  createdAt: createdAt(),
});

export const members = pgTable(
  "members",
  {
    campaignId: text("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["gm", "player", "spectator"] }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.campaignId, t.userId] })],
);

export const scenes = pgTable("scenes", {
  id: id(),
  campaignId: text("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  mapUrl: text("map_url"),
  gridSize: integer("grid_size").notNull().default(70),
  width: integer("width").notNull().default(20),
  height: integer("height").notNull().default(15),
  createdAt: createdAt(),
});

export const tokens = pgTable("tokens", {
  id: id(),
  sceneId: text("scene_id").notNull().references(() => scenes.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  x: real("x").notNull().default(0),
  y: real("y").notNull().default(0),
  size: real("size").notNull().default(1),
  color: text("color").notNull().default("#c0392b"),
  imageUrl: text("image_url"),
  sheetId: text("sheet_id").references(() => sheets.id, { onDelete: "set null" }),
  controlledBy: jsonb("controlled_by").$type<string[]>().notNull().default([]),
  hidden: boolean("hidden").notNull().default(false),
});

export const sheets = pgTable("sheets", {
  id: id(),
  campaignId: text("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  ownerId: text("owner_id").references(() => users.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  system: text("system").notNull(),
  data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
  visibility: text("visibility", { enum: ["gm", "all", "some"] }).notNull().default("gm"),
  visibleTo: jsonb("visible_to").$type<string[]>().notNull().default([]),
  createdAt: createdAt(),
});

export const journalEntries = pgTable("journal_entries", {
  id: id(),
  campaignId: text("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ["place", "npc", "quest", "handout", "session", "note"] }).notNull(),
  title: text("title").notNull(),
  content: text("content").notNull().default(""),
  gmNotes: text("gm_notes"),
  visibility: text("visibility", { enum: ["gm", "all", "some"] }).notNull().default("gm"),
  visibleTo: jsonb("visible_to").$type<string[]>().notNull().default([]),
  createdAt: createdAt(),
});
