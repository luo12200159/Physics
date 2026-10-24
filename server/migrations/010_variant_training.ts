import type { MigrationBuilder } from "node-pg-migrate";

/**
 * Stores teacher-approved variant sets once per class/cache key. The payload is
 * immutable learning content; individual student evidence continues to flow
 * through attempts, so a cached set cannot manufacture mastery evidence.
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE attempts DROP CONSTRAINT IF EXISTS attempts_variant_role_check;
    ALTER TABLE attempts ADD CONSTRAINT attempts_variant_role_check
      CHECK (variant_role IN ('diagnostic','core','near','reverse','context','far','counter','review'));

    ALTER TABLE transfer_attempts DROP CONSTRAINT IF EXISTS transfer_attempts_variant_type_check;
    ALTER TABLE transfer_attempts ADD CONSTRAINT transfer_attempts_variant_type_check
      CHECK (variant_type IN ('near','reverse','context','far','counter'));

    CREATE TABLE class_variant_sets (
      id uuid PRIMARY KEY,
      class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      client_entity_id varchar(160) NOT NULL
        CHECK (client_entity_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
      parent_question_id varchar(160) NOT NULL
        CHECK (parent_question_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
      source_content_hash varchar(16) NOT NULL CHECK (source_content_hash ~ '^[0-9a-f]{16}$'),
      cache_key varchar(600) NOT NULL,
      spec_version varchar(80) NOT NULL,
      generator_version varchar(40) NOT NULL,
      status text NOT NULL CHECK (status = 'approved'),
      payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
      payload_hash bytea NOT NULL CHECK (octet_length(payload_hash) = 32),
      created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (class_id, client_entity_id),
      UNIQUE (class_id, cache_key)
    );
    CREATE INDEX class_variant_sets_parent_idx
      ON class_variant_sets(class_id, parent_question_id, updated_at DESC);
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DROP INDEX IF EXISTS class_variant_sets_parent_idx;
    DROP TABLE IF EXISTS class_variant_sets;
    ALTER TABLE transfer_attempts DROP CONSTRAINT IF EXISTS transfer_attempts_variant_type_check;
    ALTER TABLE transfer_attempts ADD CONSTRAINT transfer_attempts_variant_type_check
      CHECK (variant_type IN ('near','far','counter'));
    ALTER TABLE attempts DROP CONSTRAINT IF EXISTS attempts_variant_role_check;
    ALTER TABLE attempts ADD CONSTRAINT attempts_variant_role_check
      CHECK (variant_role IN ('diagnostic','core','near','far','counter','review'));
  `);
}
