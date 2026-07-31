import type { MigrationBuilder } from "node-pg-migrate";

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    CREATE TABLE student_profiles (
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      client_entity_id varchar(160) NOT NULL CHECK (client_entity_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
      display_name varchar(80) NOT NULL,
      grade text NOT NULL CHECK (grade IN ('八年级','九年级','高一','高二','高三')),
      curriculum_version varchar(80) NOT NULL,
      revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
      deleted_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (user_id, client_entity_id)
    );
    CREATE TABLE attempts (
      id uuid PRIMARY KEY,
      owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      client_entity_id varchar(160) NOT NULL CHECK (client_entity_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
      profile_id uuid NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE,
      question_id varchar(160) NOT NULL CHECK (question_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
      session_client_id varchar(160) NOT NULL CHECK (session_client_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
      assignment_id uuid,
      knowledge_point_ids jsonb NOT NULL CHECK (jsonb_typeof(knowledge_point_ids) = 'array'),
      question_type text NOT NULL CHECK (question_type IN ('choice','numeric','shortAnswer','proof','experiment','modeling')),
      model_family_id varchar(160) CHECK (model_family_id IS NULL OR model_family_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
      variant_role text NOT NULL CHECK (variant_role IN ('diagnostic','core','near','far','counter','review')),
      difficulty text NOT NULL CHECK (difficulty IN ('基础','进阶','挑战')),
      started_at timestamptz NOT NULL,
      completed_at timestamptz NOT NULL CHECK (completed_at >= started_at),
      active_duration_seconds integer NOT NULL CHECK (active_duration_seconds BETWEEN 0 AND 86400),
      hint_view_count integer NOT NULL CHECK (hint_view_count BETWEEN 0 AND 100),
      max_hint_level integer NOT NULL CHECK (max_hint_level BETWEEN 0 AND 5),
      confidence_before smallint CHECK (confidence_before BETWEEN 1 AND 5),
      confidence_after smallint CHECK (confidence_after BETWEEN 1 AND 5),
      final_answer text NOT NULL CHECK (octet_length(final_answer) <= 30000),
      grading_status text NOT NULL CHECK (grading_status IN ('pending','correct','partial','incorrect')),
      score numeric(6,3) CHECK (score BETWEEN 0 AND 100),
      verification_issues jsonb NOT NULL CHECK (jsonb_typeof(verification_issues) = 'array'),
      primary_error_type text CHECK (primary_error_type IS NULL OR primary_error_type IN ('审题','概念','建模','规律适用条件','计算','单位','方向或符号','图像或实验','表达','猜测作答')),
      secondary_error_types jsonb NOT NULL CHECK (jsonb_typeof(secondary_error_types) = 'array'),
      reflection text NOT NULL CHECK (octet_length(reflection) <= 10000),
      self_explanation text NOT NULL CHECK (octet_length(self_explanation) <= 10000),
      model_evidence jsonb NOT NULL CHECK (jsonb_typeof(model_evidence) = 'object'),
      model_score numeric(6,3) CHECK (model_score BETWEEN 0 AND 100),
      teacher_review_status text NOT NULL CHECK (teacher_review_status IN ('notRequired','pending','approved','returned')),
      teacher_reviewed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (owner_user_id, client_entity_id)
    );
    CREATE INDEX attempts_profile_created_idx ON attempts(profile_id, created_at DESC);
    CREATE TABLE hint_events (
      id uuid PRIMARY KEY,
      owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      client_entity_id varchar(160) NOT NULL CHECK (client_entity_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
      attempt_id uuid NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
      level integer NOT NULL CHECK (level BETWEEN 1 AND 5),
      opened_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (owner_user_id, client_entity_id)
    );
    CREATE TABLE transfer_attempts (
      id uuid PRIMARY KEY,
      owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      client_entity_id varchar(160) NOT NULL CHECK (client_entity_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
      profile_id uuid NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE,
      source_question_id varchar(160) NOT NULL CHECK (source_question_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
      variant_id varchar(160) NOT NULL CHECK (variant_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
      variant_type text NOT NULL CHECK (variant_type IN ('near','far','counter')),
      response text NOT NULL CHECK (octet_length(response) <= 30000),
      grading_status text NOT NULL CHECK (grading_status IN ('pending','correct','partial','incorrect')),
      verification_method text NOT NULL CHECK (verification_method IN ('automatic','teacher')),
      review_comment text NOT NULL DEFAULT '' CHECK (octet_length(review_comment) <= 5000),
      reviewed_by uuid REFERENCES users(id),
      reviewed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (owner_user_id, client_entity_id)
    );
    CREATE TABLE review_schedules (
      id uuid PRIMARY KEY,
      owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      client_entity_id varchar(160) NOT NULL CHECK (client_entity_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
      profile_id uuid NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE,
      question_id varchar(160) NOT NULL CHECK (question_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
      knowledge_point_ids jsonb NOT NULL CHECK (jsonb_typeof(knowledge_point_ids) = 'array'),
      due_at timestamptz NOT NULL,
      interval_days numeric(9,4) NOT NULL CHECK (interval_days BETWEEN 0 AND 3650),
      ease_factor numeric(5,3) NOT NULL CHECK (ease_factor BETWEEN 1.000 AND 5.000),
      repetition integer NOT NULL CHECK (repetition BETWEEN 0 AND 10000),
      lapses integer NOT NULL CHECK (lapses BETWEEN 0 AND 10000),
      last_rating smallint CHECK (last_rating BETWEEN 0 AND 3),
      last_reviewed_at timestamptz,
      source_attempt_id uuid REFERENCES attempts(id) ON DELETE SET NULL,
      revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
      deleted_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (owner_user_id, client_entity_id),
      UNIQUE (profile_id, question_id)
    );
    CREATE TABLE sync_inbound_events (
      event_id uuid PRIMARY KEY,
      actor_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      device_id varchar(64) NOT NULL CHECK (device_id ~ '^[0-9a-f]{64}$'),
      scope_type text NOT NULL CHECK (scope_type IN ('user','membership')),
      scope_id uuid NOT NULL,
      entity_type varchar(40) NOT NULL,
      entity_id varchar(160) NOT NULL CHECK (entity_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
      operation text NOT NULL CHECK (operation IN ('create','update','delete')),
      base_revision integer NOT NULL CHECK (base_revision >= 0),
      payload jsonb NOT NULL,
      idempotency_key varchar(128) NOT NULL,
      request_hash bytea NOT NULL CHECK (octet_length(request_hash) = 32),
      client_created_at timestamptz NOT NULL,
      accepted_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (actor_id, idempotency_key)
    );
    CREATE TABLE sync_entity_heads (
      scope_type text NOT NULL CHECK (scope_type IN ('user','membership')),
      scope_id uuid NOT NULL,
      entity_type varchar(40) NOT NULL,
      entity_id varchar(160) NOT NULL CHECK (entity_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
      owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      revision integer NOT NULL CHECK (revision > 0),
      payload jsonb NOT NULL,
      payload_hash bytea NOT NULL CHECK (octet_length(payload_hash) = 32),
      deleted_at timestamptz,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (scope_type, scope_id, entity_type, entity_id)
    );
    CREATE TABLE sync_tombstones (
      scope_type text NOT NULL CHECK (scope_type IN ('user','membership')),
      scope_id uuid NOT NULL,
      entity_type varchar(40) NOT NULL,
      entity_id varchar(160) NOT NULL CHECK (entity_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
      owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      revision integer NOT NULL CHECK (revision > 0),
      deleted_at timestamptz NOT NULL,
      purge_after timestamptz NOT NULL CHECK (purge_after > deleted_at),
      PRIMARY KEY (scope_type, scope_id, entity_type, entity_id)
    );
    CREATE INDEX sync_tombstones_purge_idx ON sync_tombstones(purge_after);
    CREATE TABLE sync_outbox (
      sequence bigserial PRIMARY KEY,
      change_id uuid NOT NULL,
      recipient_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      class_id uuid REFERENCES classes(id) ON DELETE CASCADE,
      event_id uuid NOT NULL,
      entity_type varchar(40) NOT NULL,
      entity_id varchar(160) NOT NULL CHECK (entity_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
      operation text NOT NULL CHECK (operation IN ('create','update','delete')),
      revision integer NOT NULL CHECK (revision > 0),
      payload jsonb NOT NULL,
      occurred_at timestamptz NOT NULL DEFAULT now(),
      purge_after timestamptz NOT NULL,
      UNIQUE (recipient_user_id, change_id)
    );
    CREATE INDEX sync_outbox_pull_idx ON sync_outbox(recipient_user_id, sequence);
    CREATE INDEX sync_outbox_purge_idx ON sync_outbox(purge_after);
    CREATE TABLE sync_retention_watermarks (
      recipient_user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      last_purged_sequence bigint NOT NULL DEFAULT 0 CHECK (last_purged_sequence >= 0),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DROP TABLE sync_retention_watermarks;
    DROP TABLE sync_outbox;
    DROP TABLE sync_tombstones;
    DROP TABLE sync_entity_heads;
    DROP TABLE sync_inbound_events;
    DROP TABLE review_schedules;
    DROP TABLE transfer_attempts;
    DROP TABLE hint_events;
    DROP TABLE attempts;
    DROP TABLE student_profiles;
  `);
}
