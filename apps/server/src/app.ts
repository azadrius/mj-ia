import { existsSync, mkdirSync } from "node:fs";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { ZodError } from "zod";
import { authRoutes } from "./auth/routes";
import { env } from "./env";
import { campaignRoutes } from "./routes/campaigns";

export async function buildApp() {
  const app = Fastify({ logger: { level: env.isProduction ? "info" : "warn" } });

  await app.register(cookie);
  await app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024, files: 1 } });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({ error: "Données invalides", details: error.issues });
    }
    app.log.error(error);
    const status = (error as { statusCode?: number }).statusCode ?? 500;
    return reply.code(status).send({ error: status === 500 ? "Erreur serveur" : (error as Error).message });
  });

  await app.register(authRoutes);
  await app.register(campaignRoutes);

  // Images envoyées par le MJ (cartes, jetons).
  mkdirSync(env.uploadDir, { recursive: true });
  await app.register(fastifyStatic, { root: env.uploadDir, prefix: "/uploads/", decorateReply: false });

  // En production, le serveur sert aussi la webapp compilée.
  const webDist = new URL("../../web/dist", import.meta.url).pathname;
  if (existsSync(webDist)) {
    await app.register(fastifyStatic, { root: webDist, prefix: "/", wildcard: false });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith("/api/")) return reply.code(404).send({ error: "Introuvable" });
      return reply.sendFile("index.html");
    });
  }

  return app;
}
