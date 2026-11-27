import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { env } from "../env";
import * as schema from "./schema";

export const pool = new pg.Pool({ connectionString: env.databaseUrl });
export const db = drizzle(pool, { schema });
export type Db = typeof db;

export async function runMigrations() {
  await migrate(db, { migrationsFolder: new URL("../../drizzle", import.meta.url).pathname });
}
