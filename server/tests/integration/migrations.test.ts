import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

import { runMigrations } from "../../src/cli/migrate.js";
import { createPool, withTransaction } from "../../src/infrastructure/db.js";
import { startPostgres } from "../helpers/containers.js";

describe("database migrations", () => {
  const database = startPostgres();

  beforeAll(async () => database.start());
  afterAll(async () => database.stop());

  it("applies, rolls back one step, and reapplies", async () => {
    process.env.DATABASE_URL = database.connectionString();
    await runMigrations("up");
    const pool = createPool(database.connectionString());
    const first = await pool.query<{ name: string }>(
      "select table_name as name from information_schema.tables where table_schema='public'",
    );
    expect(first.rows.map((row) => row.name)).toContain("sync_outbox");
    const hardeningIndex = await pool.query<{ name: string | null }>(
      "select to_regclass('public.refresh_sessions_parent_once_idx') as name",
    );
    expect(hardeningIndex.rows[0]?.name).toBe("refresh_sessions_parent_once_idx");
    const membershipRevision = await pool.query<{ name: string | null }>(
      `select column_name as name from information_schema.columns
        where table_schema = 'public' and table_name = 'memberships'
          and column_name = 'revision'`,
    );
    expect(membershipRevision.rows[0]?.name).toBe("revision");
    await runMigrations("down", 1);
    const removedMembershipRevision = await pool.query<{ name: string | null }>(
      `select column_name as name from information_schema.columns
        where table_schema = 'public' and table_name = 'memberships'
          and column_name = 'revision'`,
    );
    expect(removedMembershipRevision.rows[0]?.name).toBeUndefined();
    const retainedHardeningIndex = await pool.query<{ name: string | null }>(
      "select to_regclass('public.refresh_sessions_parent_once_idx') as name",
    );
    expect(retainedHardeningIndex.rows[0]?.name).toBe("refresh_sessions_parent_once_idx");
    await runMigrations("down", 1);
    const removedHardeningIndex = await pool.query<{ name: string | null }>(
      "select to_regclass('public.refresh_sessions_parent_once_idx') as name",
    );
    expect(removedHardeningIndex.rows[0]?.name).toBeNull();
    await runMigrations("down", 1);
    const removed = await pool.query<{ name: string | null }>(
      "select to_regclass('public.account_import_batches') as name",
    );
    expect(removed.rows[0]?.name).toBeNull();
    await runMigrations("up");
    const uploads = await pool.query<{ name: string | null }>(
      "select to_regclass('public.uploads') as name",
    );
    expect(uploads.rows[0]?.name).toBe("uploads");

    const rolledBackUserId = randomUUID();
    await expect(withTransaction(pool, async (tx) => {
      await tx.query(
        "insert into users(id, role, display_name) values ($1, 'student', 'rollback-check')",
        [rolledBackUserId],
      );
      throw new Error("force rollback");
    })).rejects.toThrow("force rollback");
    const rolledBack = await pool.query<{ count: string }>(
      "select count(*)::text as count from users where id = $1",
      [rolledBackUserId],
    );
    expect(rolledBack.rows[0]?.count).toBe("0");
    await pool.end();
  });
});
