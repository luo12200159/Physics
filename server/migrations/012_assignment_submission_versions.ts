import type { MigrationBuilder } from "node-pg-migrate";

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE submissions ADD COLUMN submission_version integer;
    ALTER TABLE submissions ADD COLUMN previous_submission_id uuid REFERENCES submissions(id) ON DELETE SET NULL;
    WITH numbered AS (
      SELECT id, row_number() OVER (
        PARTITION BY assignment_id, membership_id ORDER BY submitted_at, created_at, id
      ) AS version_number
      FROM submissions
    )
    UPDATE submissions s SET submission_version = n.version_number
      FROM numbered n WHERE n.id = s.id;
    ALTER TABLE submissions ALTER COLUMN submission_version SET NOT NULL;
    ALTER TABLE submissions ADD CONSTRAINT submissions_version_positive CHECK (submission_version > 0);
    CREATE UNIQUE INDEX submissions_assignment_member_version_idx
      ON submissions(assignment_id, membership_id, submission_version);
    CREATE INDEX submissions_student_history_idx
      ON submissions(student_user_id, assignment_id, submitted_at DESC);
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DROP INDEX submissions_student_history_idx;
    DROP INDEX submissions_assignment_member_version_idx;
    ALTER TABLE submissions DROP CONSTRAINT submissions_version_positive;
    ALTER TABLE submissions DROP COLUMN previous_submission_id;
    ALTER TABLE submissions DROP COLUMN submission_version;
  `);
}
