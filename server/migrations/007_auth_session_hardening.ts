import type { MigrationBuilder } from "node-pg-migrate";

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    CREATE UNIQUE INDEX refresh_sessions_parent_once_idx
      ON refresh_sessions(parent_id)
      WHERE parent_id IS NOT NULL;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql("DROP INDEX refresh_sessions_parent_once_idx;");
}
