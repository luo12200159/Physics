import path from "node:path";
import { fileURLToPath } from "node:url";

import { runner } from "node-pg-migrate";

export async function runMigrations(direction: "up" | "down", count?: number): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  await runner({
    databaseUrl,
    dir: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../migrations"),
    direction,
    ...(count === undefined ? {} : { count }),
    migrationsTable: "pgmigrations",
    checkOrder: true,
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const direction = process.argv[2] === "down" ? "down" : "up";
  await runMigrations(direction, direction === "down" ? 1 : undefined);
}
