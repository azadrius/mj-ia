import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../db/client";
import { users } from "../db/schema";
import { env } from "../env";
import { createSession, destroySession, SESSION_COOKIE, userFromSessionId } from "./session";

const OAUTH_STATE_COOKIE = "mjia_oauth_state";
const callbackUrl = () => `${env.appUrl}/api/auth/discord/callback`;

export async function authRoutes(app: FastifyInstance) {
  app.get("/api/auth/config", async () => ({
    discord: Boolean(env.discordClientId && env.discordClientSecret),
    devLogin: env.allowDevLogin,
  }));

  app.get("/api/me", async (request, reply) => {
    const user = await userFromSessionId(request.cookies[SESSION_COOKIE]);
    if (!user) return reply.code(401).send({ error: "Non connecté" });
    return user;
  });

  app.post("/api/auth/logout", async (request, reply) => {
    await destroySession(request, reply);
    return { ok: true };
  });

  // Connexion de développement : un simple pseudo, sans Discord.
  app.post("/api/auth/dev", async (request, reply) => {
    if (!env.allowDevLogin) return reply.code(404).send({ error: "Désactivé" });
    const { name } = z.object({ name: z.string().trim().min(1).max(40) }).parse(request.body);
    const discordId = `dev:${name.toLowerCase()}`;
    const [user] = await db
      .insert(users)
      .values({ name, discordId })
      .onConflictDoUpdate({ target: users.discordId, set: { name } })
      .returning();
    await createSession(reply, user.id);
    return { id: user.id, name: user.name, avatarUrl: user.avatarUrl };
  });

  // Connexion Discord (OAuth2, scope "identify").
  app.get("/api/auth/discord", async (_request, reply) => {
    if (!env.discordClientId) return reply.code(404).send({ error: "Discord non configuré" });
    const state = randomBytes(16).toString("base64url");
    reply.setCookie(OAUTH_STATE_COOKIE, state, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 600 });
    const params = new URLSearchParams({
      client_id: env.discordClientId,
      response_type: "code",
      redirect_uri: callbackUrl(),
      scope: "identify",
      state,
    });
    return reply.redirect(`https://discord.com/oauth2/authorize?${params}`);
  });

  app.get("/api/auth/discord/callback", async (request, reply) => {
    const { code, state } = z.object({ code: z.string(), state: z.string() }).parse(request.query);
    if (!state || state !== request.cookies[OAUTH_STATE_COOKIE]) {
      return reply.code(400).send({ error: "État OAuth invalide" });
    }
    reply.clearCookie(OAUTH_STATE_COOKIE, { path: "/" });

    const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.discordClientId,
        client_secret: env.discordClientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: callbackUrl(),
      }),
    });
    if (!tokenRes.ok) return reply.code(502).send({ error: "Échec de la connexion Discord" });
    const { access_token } = (await tokenRes.json()) as { access_token: string };

    const meRes = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    if (!meRes.ok) return reply.code(502).send({ error: "Profil Discord indisponible" });
    const me = (await meRes.json()) as { id: string; username: string; global_name?: string; avatar?: string };
    const name = me.global_name || me.username;
    const avatarUrl = me.avatar ? `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png` : null;

    const [existing] = await db.select().from(users).where(eq(users.discordId, me.id));
    const user = existing
      ? (await db.update(users).set({ name, avatarUrl }).where(eq(users.id, existing.id)).returning())[0]
      : (await db.insert(users).values({ discordId: me.id, name, avatarUrl }).returning())[0];

    await createSession(reply, user.id);
    return reply.redirect(env.appUrl);
  });
}
