import { randomBytes } from "node:crypto";
import type { User } from "@mj-ia/shared";
import { and, eq, gt } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import { db } from "../db/client";
import { sessions, users } from "../db/schema";
import { env } from "../env";

export const SESSION_COOKIE = "mjia_session";
const SESSION_DAYS = 30;

export async function createSession(reply: FastifyReply, userId: string) {
  const id = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 3600 * 1000);
  await db.insert(sessions).values({ id, userId, expiresAt });
  reply.setCookie(SESSION_COOKIE, id, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    // Cookie « Secure » seulement derrière HTTPS (tunnel), pour que http://localhost marche aussi.
    secure: env.appUrl.startsWith("https://"),
    expires: expiresAt,
  });
}

export async function destroySession(request: FastifyRequest, reply: FastifyReply) {
  const id = request.cookies[SESSION_COOKIE];
  if (id) await db.delete(sessions).where(eq(sessions.id, id));
  reply.clearCookie(SESSION_COOKIE, { path: "/" });
}

export async function userFromSessionId(sessionId: string | undefined): Promise<User | null> {
  if (!sessionId) return null;
  const [row] = await db
    .select({ id: users.id, name: users.name, avatarUrl: users.avatarUrl })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, sessionId), gt(sessions.expiresAt, new Date())));
  return row ?? null;
}

/** Renvoie l'utilisateur connecté, ou répond 401. */
export async function requireUser(request: FastifyRequest, reply: FastifyReply): Promise<User | null> {
  const user = await userFromSessionId(request.cookies[SESSION_COOKIE]);
  if (!user) {
    reply.code(401).send({ error: "Non connecté" });
    return null;
  }
  return user;
}
