import { buildApp } from "./app";
import { runMigrations } from "./db/client";
import { env } from "./env";
import { setupRealtime } from "./realtime";

await runMigrations();
const app = await buildApp();
setupRealtime(app.server);
await app.listen({ port: env.port, host: "0.0.0.0" });
console.log(`Serveur MJ IA prêt sur http://localhost:${env.port}`);
