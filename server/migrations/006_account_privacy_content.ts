import type { MigrationBuilder } from "node-pg-migrate";

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE uploads DROP CONSTRAINT uploads_purpose_check;
    ALTER TABLE uploads ADD CONSTRAINT uploads_purpose_check
      CHECK (purpose IN ('feedbackAttachment','submissionAttachment','examImport','reportArtifact','accountImport','credentialArtifact','privacyExport'));
    ALTER TABLE uploads DROP CONSTRAINT uploads_declared_bytes_check;
    ALTER TABLE uploads ADD CONSTRAINT uploads_declared_bytes_check
      CHECK (declared_bytes BETWEEN 1 AND 1073741824);

    CREATE TABLE account_import_batches (
      id uuid PRIMARY KEY,
      source_upload_id uuid NOT NULL REFERENCES uploads(id) ON DELETE RESTRICT,
      created_by uuid NOT NULL REFERENCES users(id),
      class_id uuid REFERENCES classes(id) ON DELETE SET NULL,
      default_role text NOT NULL CHECK (default_role IN ('student','teacher','parent')),
      status text NOT NULL CHECK (status IN ('queued','processing','needsCorrection','completed','failed')),
      total_rows integer NOT NULL DEFAULT 0 CHECK (total_rows BETWEEN 0 AND 5000),
      created_rows integer NOT NULL DEFAULT 0 CHECK (created_rows BETWEEN 0 AND total_rows),
      failed_rows integer NOT NULL DEFAULT 0 CHECK (failed_rows BETWEEN 0 AND total_rows),
      errors jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(errors) = 'array'),
      created_at timestamptz NOT NULL DEFAULT now(),
      completed_at timestamptz
    );
    CREATE TABLE account_import_rows (
      id uuid PRIMARY KEY,
      batch_id uuid NOT NULL REFERENCES account_import_batches(id) ON DELETE CASCADE,
      row_number integer NOT NULL CHECK (row_number > 0),
      login_normalized varchar(120),
      created_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
      status text NOT NULL CHECK (status IN ('created','invalid','duplicate','failed')),
      error_code varchar(120),
      UNIQUE (batch_id, row_number)
    );
    CREATE TABLE credential_artifacts (
      id uuid PRIMARY KEY,
      created_by uuid NOT NULL REFERENCES users(id),
      batch_id uuid UNIQUE REFERENCES account_import_batches(id) ON DELETE CASCADE,
      target_user_id uuid REFERENCES users(id) ON DELETE CASCADE,
      upload_id uuid NOT NULL UNIQUE REFERENCES uploads(id) ON DELETE RESTRICT,
      expires_at timestamptz NOT NULL,
      consumed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      CHECK (num_nonnulls(batch_id, target_user_id) = 1)
    );
    ALTER TABLE account_import_batches ADD COLUMN credential_artifact_id uuid UNIQUE
      REFERENCES credential_artifacts(id) ON DELETE SET NULL;

    CREATE TABLE privacy_export_jobs (
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      format text NOT NULL CHECK (format = 'json'),
      status text NOT NULL CHECK (status IN ('queued','running','completed','failed','expired')),
      upload_id uuid UNIQUE REFERENCES uploads(id) ON DELETE RESTRICT,
      failure_code varchar(120),
      created_at timestamptz NOT NULL DEFAULT now(),
      completed_at timestamptz,
      expires_at timestamptz
    );
    CREATE INDEX privacy_export_owner_idx ON privacy_export_jobs(user_id, created_at DESC);
    CREATE TABLE account_deletion_requests (
      id uuid PRIMARY KEY,
      user_id uuid REFERENCES users(id) ON DELETE SET NULL,
      status text NOT NULL CHECK (status IN ('gracePeriod','cancelled','processing','completed','failed')),
      grace_ends_at timestamptz NOT NULL,
      requested_at timestamptz NOT NULL DEFAULT now(),
      cancelled_at timestamptz,
      processing_started_at timestamptz,
      completed_at timestamptz,
      failure_code varchar(120)
    );
    CREATE UNIQUE INDEX account_deletion_live_idx ON account_deletion_requests(user_id)
      WHERE user_id IS NOT NULL AND status IN ('gracePeriod','processing');

    CREATE TABLE question_content_versions (
      id uuid PRIMARY KEY,
      question_id varchar(160) NOT NULL CHECK (question_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
      version integer NOT NULL CHECK (version > 0),
      title varchar(300) NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 300),
      stem text NOT NULL CHECK (octet_length(stem) BETWEEN 1 AND 60000),
      rich_stem_v1 jsonb CHECK (rich_stem_v1 IS NULL OR jsonb_typeof(rich_stem_v1) = 'array'),
      options jsonb NOT NULL CHECK (jsonb_typeof(options) = 'array'),
      attachment_refs jsonb NOT NULL CHECK (jsonb_typeof(attachment_refs) = 'array'),
      grading_method text NOT NULL CHECK (grading_method IN ('choice','numeric','text','teacherReview')),
      answer text NOT NULL CHECK (octet_length(answer) BETWEEN 1 AND 30000),
      solution text NOT NULL CHECK (octet_length(solution) BETWEEN 1 AND 60000),
      rich_solution_v1 jsonb CHECK (rich_solution_v1 IS NULL OR jsonb_typeof(rich_solution_v1) = 'array'),
      knowledge_point_ids jsonb NOT NULL CHECK (jsonb_typeof(knowledge_point_ids) = 'array'),
      source jsonb NOT NULL CHECK (jsonb_typeof(source) = 'object'),
      content_sha256 char(64) CHECK (content_sha256 IS NULL OR content_sha256 ~ '^[0-9a-f]{64}$'),
      status text NOT NULL CHECK (status IN ('draft','published','rejected','withdrawn','quarantined')),
      created_by uuid NOT NULL REFERENCES users(id),
      published_at timestamptz,
      withdrawn_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (question_id, version),
      CHECK ((status = 'published' AND content_sha256 IS NOT NULL AND published_at IS NOT NULL) OR status <> 'published')
    );
    CREATE TABLE question_content_reviews (
      id uuid PRIMARY KEY,
      content_version_id uuid NOT NULL REFERENCES question_content_versions(id) ON DELETE CASCADE,
      actor_id uuid NOT NULL REFERENCES users(id),
      decision text NOT NULL CHECK (decision IN ('approve','reject','withdraw','quarantine')),
      previous_status text NOT NULL CHECK (previous_status IN ('draft','published','rejected','withdrawn','quarantined')),
      next_status text NOT NULL CHECK (next_status IN ('draft','published','rejected','withdrawn','quarantined')),
      reason varchar(1000) NOT NULL CHECK (char_length(trim(reason)) BETWEEN 1 AND 1000),
      created_at timestamptz NOT NULL DEFAULT now(),
      CHECK (
        (decision = 'approve' AND previous_status = 'draft' AND next_status = 'published') OR
        (decision = 'reject' AND previous_status = 'draft' AND next_status = 'rejected') OR
        (decision = 'withdraw' AND previous_status = 'published' AND next_status = 'withdrawn') OR
        (decision = 'quarantine' AND previous_status IN ('published','withdrawn') AND next_status = 'quarantined')
      )
    );
    CREATE INDEX question_content_reviews_version_idx
      ON question_content_reviews(content_version_id, created_at);
    ALTER TABLE assignments ADD COLUMN solution_release_policy text NOT NULL DEFAULT 'afterSubmit'
      CHECK (solution_release_policy IN ('afterSubmit','afterDue','teacherRelease','never'));
    ALTER TABLE assignments ADD COLUMN solutions_released_at timestamptz;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE assignments DROP COLUMN solutions_released_at;
    ALTER TABLE assignments DROP COLUMN solution_release_policy;
    DROP TABLE question_content_reviews;
    DROP TABLE question_content_versions;
    DROP TABLE account_deletion_requests;
    DROP TABLE privacy_export_jobs;
    ALTER TABLE account_import_batches DROP COLUMN credential_artifact_id;
    DROP TABLE credential_artifacts;
    DROP TABLE account_import_rows;
    DROP TABLE account_import_batches;
    ALTER TABLE uploads DROP CONSTRAINT uploads_declared_bytes_check;
    ALTER TABLE uploads ADD CONSTRAINT uploads_declared_bytes_check
      CHECK (declared_bytes BETWEEN 1 AND 31457280);
    ALTER TABLE uploads DROP CONSTRAINT uploads_purpose_check;
    ALTER TABLE uploads ADD CONSTRAINT uploads_purpose_check
      CHECK (purpose IN ('feedbackAttachment','submissionAttachment','examImport','reportArtifact'));
  `);
}
