import type { MigrationBuilder } from "node-pg-migrate";

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    CREATE TABLE classes (
      id uuid PRIMARY KEY,
      owner_teacher_id uuid NOT NULL REFERENCES users(id),
      name varchar(120) NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 120),
      grade text NOT NULL CHECK (grade IN ('八年级','九年级','高一','高二','高三')),
      subject varchar(40) NOT NULL DEFAULT '物理' CHECK (subject = '物理'),
      school_label varchar(120) CHECK (school_label IS NULL OR char_length(trim(school_label)) BETWEEN 1 AND 120),
      status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
      revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX classes_owner_idx ON classes(owner_teacher_id, status);
    ALTER TABLE audit_events ADD CONSTRAINT audit_events_class_fk
      FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL;
    CREATE TABLE class_groups (
      id uuid PRIMARY KEY,
      class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      name varchar(80) NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 80),
      revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
      deleted_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (class_id, name)
    );
    CREATE TABLE memberships (
      id uuid PRIMARY KEY,
      class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      group_id uuid REFERENCES class_groups(id) ON DELETE SET NULL,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      member_role text NOT NULL CHECK (member_role IN ('student','teacher')),
      student_number varchar(40),
      status text NOT NULL CHECK (status IN ('pending','active','removed')),
      joined_at timestamptz,
      updated_at timestamptz NOT NULL DEFAULT now(),
      CHECK ((status = 'active' AND joined_at IS NOT NULL) OR status <> 'active')
    );
    CREATE UNIQUE INDEX memberships_live_user_class_idx
      ON memberships(class_id, user_id) WHERE status <> 'removed';
    CREATE INDEX memberships_roster_idx ON memberships(class_id, status, group_id, student_number);
    CREATE TABLE invites (
      id uuid PRIMARY KEY,
      class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      code_hash bytea NOT NULL UNIQUE CHECK (octet_length(code_hash) = 32),
      expires_at timestamptz NOT NULL,
      max_uses integer NOT NULL CHECK (max_uses BETWEEN 1 AND 1000),
      used_count integer NOT NULL DEFAULT 0 CHECK (used_count >= 0 AND used_count <= max_uses),
      status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked','exhausted','expired')),
      created_by uuid NOT NULL REFERENCES users(id),
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX invites_class_idx ON invites(class_id, status, expires_at);
    CREATE TABLE guardian_links (
      id uuid PRIMARY KEY,
      class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      parent_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      student_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
      granted_by uuid NOT NULL REFERENCES users(id),
      created_at timestamptz NOT NULL DEFAULT now(),
      revoked_at timestamptz,
      UNIQUE (class_id, parent_user_id, student_user_id)
    );
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DROP TABLE guardian_links;
    DROP TABLE invites;
    DROP TABLE memberships;
    DROP TABLE class_groups;
    ALTER TABLE audit_events DROP CONSTRAINT audit_events_class_fk;
    DROP TABLE classes;
  `);
}
