import type { MigrationBuilder } from "node-pg-migrate";

/**
 * Anonymous teacher mode is deliberately scoped to one class.  The raw
 * capability is returned only at creation time; the database stores a
 * SHA-256/HMAC digest and therefore cannot be used as a bearer-token dump.
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    CREATE TABLE class_owner_capabilities (
      id uuid PRIMARY KEY,
      class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash bytea NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
      expires_at timestamptz NOT NULL,
      revoked_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      CHECK (expires_at > created_at)
    );
    CREATE INDEX class_owner_capabilities_lookup_idx
      ON class_owner_capabilities(token_hash, revoked_at, expires_at);
    CREATE INDEX class_owner_capabilities_owner_idx
      ON class_owner_capabilities(owner_user_id, class_id);
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DROP INDEX class_owner_capabilities_owner_idx;
    DROP INDEX class_owner_capabilities_lookup_idx;
    DROP TABLE class_owner_capabilities;
  `);
}
