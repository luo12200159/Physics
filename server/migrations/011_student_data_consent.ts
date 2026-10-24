import type { MigrationBuilder } from "node-pg-migrate";

// No row is created for legacy accounts. Until a verified record is entered by
// an authorized consent workflow, learning/exam uploads remain disabled.
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    CREATE TABLE student_data_consents (
      student_user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      age_band text NOT NULL CHECK (age_band IN ('under14','14plus')),
      guardian_user_id uuid REFERENCES users(id) ON DELETE RESTRICT,
      consent_status text NOT NULL CHECK (consent_status IN ('verified','withdrawn')),
      consent_version varchar(80) NOT NULL,
      verified_at timestamptz NOT NULL,
      withdrawn_at timestamptz,
      verification_source varchar(160) NOT NULL,
      CHECK (age_band <> 'under14' OR guardian_user_id IS NOT NULL),
      CHECK ((consent_status = 'withdrawn') = (withdrawn_at IS NOT NULL))
    );
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql("DROP TABLE student_data_consents;");
}
