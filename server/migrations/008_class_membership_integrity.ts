import type { MigrationBuilder } from "node-pg-migrate";

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE memberships
      ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK (revision > 0);
    ALTER TABLE class_groups
      ADD CONSTRAINT class_groups_class_id_id_unique UNIQUE (class_id, id);
    ALTER TABLE memberships
      ADD CONSTRAINT memberships_class_group_fk
      FOREIGN KEY (class_id, group_id)
      REFERENCES class_groups(class_id, id);
    CREATE INDEX memberships_user_status_class_idx
      ON memberships(user_id, status, class_id);
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DROP INDEX memberships_user_status_class_idx;
    ALTER TABLE memberships DROP CONSTRAINT memberships_class_group_fk;
    ALTER TABLE class_groups DROP CONSTRAINT class_groups_class_id_id_unique;
    ALTER TABLE memberships DROP COLUMN revision;
  `);
}
