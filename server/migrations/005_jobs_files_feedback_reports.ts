import type { MigrationBuilder } from "node-pg-migrate";

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    CREATE TABLE uploads (
      id uuid PRIMARY KEY,
      owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      purpose text NOT NULL CHECK (purpose IN ('feedbackAttachment','submissionAttachment','examImport','reportArtifact')),
      object_key varchar(500) NOT NULL UNIQUE,
      original_name varchar(180) NOT NULL,
      declared_mime varchar(120) NOT NULL,
      detected_mime varchar(120),
      declared_bytes bigint NOT NULL CHECK (declared_bytes BETWEEN 1 AND 31457280),
      actual_bytes bigint,
      sha256_hex char(64) NOT NULL CHECK (sha256_hex ~ '^[0-9a-f]{64}$'),
      status text NOT NULL CHECK (status IN ('presigned','uploaded','verifying','verified','rejected','deleted')),
      rejection_code varchar(80),
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      verified_at timestamptz
    );
    CREATE TABLE job_outbox (
      id uuid PRIMARY KEY,
      topic text NOT NULL CHECK (topic IN ('verifyUpload','sendFeedback','generateReport','importExam','importAccounts','deleteAccount')),
      aggregate_id uuid NOT NULL,
      payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
      status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','dispatching','dispatched','failed')),
      attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
      available_at timestamptz NOT NULL DEFAULT now(),
      locked_at timestamptz,
      last_error varchar(1000),
      created_at timestamptz NOT NULL DEFAULT now(),
      dispatched_at timestamptz,
      UNIQUE (topic, aggregate_id)
    );
    CREATE INDEX job_outbox_claim_idx ON job_outbox(status, available_at, created_at);
    CREATE TABLE feedback (
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      category text NOT NULL CHECK (category IN ('bug','content','account','sync','suggestion','other')),
      description text NOT NULL CHECK (octet_length(description) BETWEEN 10 AND 10000),
      current_page varchar(200) NOT NULL,
      contact varchar(200),
      app_version varchar(40) NOT NULL,
      system_type text NOT NULL CHECK (system_type IN ('windows','android')),
      redacted_logs jsonb NOT NULL CHECK (jsonb_typeof(redacted_logs) = 'array'),
      status text NOT NULL CHECK (status IN ('queued','sent','retrying','failed')),
      created_at timestamptz NOT NULL DEFAULT now(),
      sent_at timestamptz
    );
    CREATE TABLE feedback_attachments (
      feedback_id uuid NOT NULL REFERENCES feedback(id) ON DELETE CASCADE,
      upload_id uuid NOT NULL REFERENCES uploads(id) ON DELETE RESTRICT,
      PRIMARY KEY (feedback_id, upload_id)
    );
    CREATE TABLE email_deliveries (
      id uuid PRIMARY KEY,
      feedback_id uuid NOT NULL UNIQUE REFERENCES feedback(id) ON DELETE CASCADE,
      recipient varchar(254) NOT NULL CHECK (recipient = 'luo865265@gmail.com'),
      message_id varchar(255) NOT NULL UNIQUE,
      status text NOT NULL CHECK (status IN ('queued','sending','sent','retrying','failed')),
      attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
      last_error_code varchar(120),
      next_attempt_at timestamptz,
      sent_at timestamptz,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE report_jobs (
      id uuid PRIMARY KEY,
      requested_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      report_type text NOT NULL CHECK (report_type IN ('studentLearningSummary','classLearningSummary','auditExport')),
      format text NOT NULL CHECK (format IN ('json','csv')),
      scope_type text NOT NULL CHECK (scope_type IN ('student','class','audit')),
      scope_id uuid,
      status text NOT NULL CHECK (status IN ('queued','running','completed','failed')),
      failure_code varchar(120),
      created_at timestamptz NOT NULL DEFAULT now(),
      started_at timestamptz,
      completed_at timestamptz
    );
    CREATE TABLE report_artifacts (
      id uuid PRIMARY KEY,
      report_job_id uuid NOT NULL UNIQUE REFERENCES report_jobs(id) ON DELETE CASCADE,
      upload_id uuid NOT NULL UNIQUE REFERENCES uploads(id) ON DELETE RESTRICT,
      row_count integer NOT NULL CHECK (row_count >= 0),
      created_at timestamptz NOT NULL DEFAULT now()
    );
    ALTER TABLE exam_import_batches ADD CONSTRAINT exam_import_batches_upload_fk
      FOREIGN KEY (upload_id) REFERENCES uploads(id) ON DELETE RESTRICT;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE exam_import_batches DROP CONSTRAINT exam_import_batches_upload_fk;
    DROP TABLE report_artifacts;
    DROP TABLE report_jobs;
    DROP TABLE email_deliveries;
    DROP TABLE feedback_attachments;
    DROP TABLE feedback;
    DROP TABLE job_outbox;
    DROP TABLE uploads;
  `);
}
