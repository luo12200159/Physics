import type { MigrationBuilder } from "node-pg-migrate";

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    CREATE TABLE users (
      id uuid PRIMARY KEY,
      role text NOT NULL CHECK (role IN ('student','teacher','parent','administrator')),
      display_name varchar(80) NOT NULL CHECK (char_length(trim(display_name)) BETWEEN 1 AND 80),
      status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
      must_change_password boolean NOT NULL DEFAULT false,
      disabled_at timestamptz,
      CHECK ((status = 'disabled' AND disabled_at IS NOT NULL) OR status = 'active'),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE password_credentials (
      user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      login_normalized varchar(120) NOT NULL UNIQUE,
      password_hash text NOT NULL CHECK (password_hash LIKE '$argon2id$%'),
      credential_version integer NOT NULL DEFAULT 1 CHECK (credential_version > 0),
      temporary_expires_at timestamptz,
      changed_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE refresh_sessions (
      id uuid PRIMARY KEY,
      family_id uuid NOT NULL,
      parent_id uuid REFERENCES refresh_sessions(id) ON DELETE SET NULL,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      device_id varchar(64) NOT NULL CHECK (device_id ~ '^[0-9a-f]{64}$'),
      device_name varchar(80) NOT NULL,
      token_hash bytea NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
      session_strength text NOT NULL DEFAULT 'password' CHECK (session_strength IN ('password','reauthenticated')),
      expires_at timestamptz NOT NULL,
      rotated_at timestamptz,
      replaced_by_id uuid REFERENCES refresh_sessions(id) ON DELETE SET NULL,
      revoked_at timestamptz,
      revoke_reason varchar(40),
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX refresh_sessions_family_idx ON refresh_sessions(family_id);
    CREATE INDEX refresh_sessions_user_idx ON refresh_sessions(user_id, expires_at DESC);
    CREATE TABLE api_idempotency (
      actor_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      route_key varchar(120) NOT NULL,
      idempotency_key varchar(128) NOT NULL,
      request_hash bytea NOT NULL CHECK (octet_length(request_hash) = 32),
      response_status integer NOT NULL CHECK (response_status BETWEEN 200 AND 299),
      response_body jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL,
      PRIMARY KEY (actor_id, route_key, idempotency_key)
    );
    CREATE INDEX api_idempotency_expiry_idx ON api_idempotency(expires_at);
    CREATE TABLE audit_events (
      id uuid PRIMARY KEY,
      actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
      actor_role text CHECK (actor_role IS NULL OR actor_role IN ('student','teacher','parent','administrator')),
      action varchar(120) NOT NULL,
      resource_type varchar(80) NOT NULL,
      resource_id varchar(160) CHECK (resource_id IS NULL OR resource_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
      class_id uuid,
      result text NOT NULL CHECK (result IN ('allowed','denied','succeeded','failed')),
      before_state jsonb,
      after_state jsonb,
      reason varchar(500),
      request_id uuid NOT NULL,
      ip_hash bytea CHECK (ip_hash IS NULL OR octet_length(ip_hash) = 32),
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX audit_events_resource_idx ON audit_events(resource_type, resource_id, created_at DESC);
    CREATE INDEX audit_events_class_idx ON audit_events(class_id, created_at DESC);
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DROP TABLE audit_events;
    DROP TABLE api_idempotency;
    DROP TABLE refresh_sessions;
    DROP TABLE password_credentials;
    DROP TABLE users;
  `);
}
