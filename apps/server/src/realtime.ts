import type { Server as HttpServer } from "node:http";
import {
  buildCampaignView,
  canMoveToken,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from "@mj-ia/shared";
import { eq } from "drizzle-orm";
import { Server, type Socket } from "socket.io";
import { userFromSessionId, SESSION_COOKIE } from "./auth/session";
import { db } from "./db/client";
import { loadCampaignData, loadMember, toToken } from "./db/load";
import { scenes, tokens } from "./db/schema";

interface SocketData {
  userId: string;
  campaignId?: string;
}

type IO = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
let io: IO | null = null;

const room = (campaignId: string) => `campaign:${campaignId}`;

function parseCookie(header: string | undefined, name: string) {
  for (const part of (header ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

export function setupRealtime(server: HttpServer) {
  io = new Server(server, { path: "/socket.io", serveClient: false });

  // Authentification par le cookie de session.
  io.use(async (socket, next) => {
    const user = await userFromSessionId(parseCookie(socket.handshake.headers.cookie, SESSION_COOKIE));
    if (!user) return next(new Error("Non connecté"));
    socket.data.userId = user.id;
    next();
  });

  io.on("connection", (socket) => {
    socket.on("campaign:join", async (campaignId, ack) => {
      const member = await loadMember(campaignId, socket.data.userId);
      if (!member) return ack(false);
      if (socket.data.campaignId) socket.leave(room(socket.data.campaignId));
      socket.data.campaignId = campaignId;
      socket.join(room(campaignId));
      ack(true);
    });

    socket.on("token:move", async ({ tokenId, x, y }) => {
      await handleTokenMove(socket, tokenId, x, y).catch(() => socket.emit("error", "Déplacement impossible"));
    });
  });
}

async function handleTokenMove(socket: Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>, tokenId: string, x: number, y: number) {
  const campaignId = socket.data.campaignId;
  if (!campaignId || !Number.isFinite(x) || !Number.isFinite(y)) return;

  const [row] = await db
    .select({ token: tokens, campaignId: scenes.campaignId })
    .from(tokens)
    .innerJoin(scenes, eq(scenes.id, tokens.sceneId))
    .where(eq(tokens.id, tokenId));
  if (!row || row.campaignId !== campaignId) return;

  const member = await loadMember(campaignId, socket.data.userId);
  if (!member || !canMoveToken(toToken(row.token), member)) {
    socket.emit("error", "Tu ne contrôles pas ce jeton");
    // On renvoie la vraie position pour annuler le déplacement côté client.
    await broadcastTokens(campaignId, [tokenId]);
    return;
  }

  await db.update(tokens).set({ x, y }).where(eq(tokens.id, tokenId));
  await broadcastTokens(campaignId, [tokenId]);
}

/**
 * Envoie l'état de jetons à chaque membre connecté, filtré pour lui :
 * un membre qui ne doit pas voir le jeton reçoit "token:remove".
 */
export async function broadcastTokens(campaignId: string, tokenIds: string[]) {
  if (!io) return;
  const sockets = await io.in(room(campaignId)).fetchSockets();
  if (!sockets.length) return;
  const data = await loadCampaignData(campaignId);
  if (!data) return;

  for (const socket of sockets) {
    const me = data.members.find((m) => m.userId === socket.data.userId);
    if (!me) continue;
    const view = buildCampaignView(data, me);
    for (const id of tokenIds) {
      const token = view.tokens.find((t) => t.id === id);
      if (token) socket.emit("token:upsert", token);
      else socket.emit("token:remove", id);
    }
  }
}

/** Signale un changement : chaque client recharge sa vue filtrée. */
export function notifyCampaignChanged(campaignId: string) {
  io?.to(room(campaignId)).emit("campaign:changed");
}
