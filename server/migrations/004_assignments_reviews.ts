import type { MigrationBuilder } from "node-pg-migrate";

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    CREATE TABLE assignments (
      id uuid PRIMARY KEY,
      class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      created_by uuid NOT NULL REFERENCES users(id),
      title varchar(160) NOT NULL,
      instructions text NOT NULL CHECK (octet_length(instructions) <= 30000),
      due_at timestamptz,
      status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','closed')),
      revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
      published_snapshot jsonb,
      published_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE assignment_targets (
      id uuid PRIMARY KEY,
      assignment_id uuid NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
      class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      group_id uuid REFERENCES class_groups(id) ON DELETE CASCADE,
      membership_id uuid REFERENCES memberships(id) ON DELETE CASCADE,
      CHECK (num_nonnulls(group_id, membership_id) <= 1)
    );
    CREATE UNIQUE INDEX assignment_targets_class_unique_idx
      ON assignment_targets(assignment_id, class_id) WHERE group_id IS NULL AND membership_id IS NULL;
    CREATE UNIQUE INDEX assignment_targets_group_unique_idx
      ON assignment_targets(assignment_id, class_id, group_id) WHERE group_id IS NOT NULL;
    CREATE UNIQUE INDEX assignment_targets_student_unique_idx
      ON assignment_targets(assignment_id, class_id, membership_id) WHERE membership_id IS NOT NULL;
    CREATE TABLE submissions (
      id uuid PRIMARY KEY,
      assignment_id uuid NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
      membership_id uuid NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
      student_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      client_entity_id varchar(160) NOT NULL CHECK (client_entity_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
      answers jsonb NOT NULL CHECK (jsonb_typeof(answers) = 'array'),
      status text NOT NULL CHECK (status IN ('submitted','underReview','returned','accepted')),
      submitted_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (membership_id, client_entity_id)
    );
    CREATE INDEX submissions_review_idx ON submissions(assignment_id, status, submitted_at);
    CREATE TABLE corrections (
      id uuid PRIMARY KEY,
      submission_id uuid NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
      student_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      client_entity_id varchar(160) NOT NULL CHECK (client_entity_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
      question_id varchar(160) NOT NULL CHECK (question_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
      answer text NOT NULL CHECK (octet_length(answer) <= 30000),
      explanation text NOT NULL CHECK (octet_length(explanation) <= 30000),
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (student_user_id, client_entity_id)
    );
    CREATE INDEX corrections_submission_question_idx
      ON corrections(submission_id, question_id, created_at, id);
    CREATE TABLE review_cases (
      id uuid PRIMARY KEY,
      submission_id uuid NOT NULL UNIQUE REFERENCES submissions(id) ON DELETE CASCADE,
      class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      status text NOT NULL CHECK (status IN ('pending','approved','returned','rejudged')),
      current_score numeric(6,3) CHECK (current_score BETWEEN 0 AND 100),
      current_per_question_scores jsonb CHECK (current_per_question_scores IS NULL OR jsonb_typeof(current_per_question_scores) = 'array'),
      revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CHECK (
        (status = 'pending' AND current_score IS NULL AND current_per_question_scores IS NULL) OR
        (status IN ('approved','returned','rejudged') AND current_score IS NOT NULL AND current_per_question_scores IS NOT NULL)
      )
    );
    CREATE TABLE review_decisions (
      id uuid PRIMARY KEY,
      review_id uuid NOT NULL REFERENCES review_cases(id) ON DELETE CASCADE,
      actor_id uuid NOT NULL REFERENCES users(id),
      revision integer NOT NULL CHECK (revision > 1),
      decision text NOT NULL CHECK (decision IN ('approve','return','rejudge')),
      previous_status text NOT NULL CHECK (previous_status IN ('pending','approved','returned','rejudged')),
      next_status text NOT NULL CHECK (next_status IN ('approved','returned','rejudged')),
      previous_score numeric(6,3) CHECK (previous_score BETWEEN 0 AND 100),
      next_score numeric(6,3) NOT NULL CHECK (next_score BETWEEN 0 AND 100),
      per_question_scores jsonb NOT NULL CHECK (jsonb_typeof(per_question_scores) = 'array'),
      reason varchar(1000) NOT NULL CHECK (char_length(trim(reason)) BETWEEN 1 AND 1000),
      annotation jsonb NOT NULL CHECK (jsonb_typeof(annotation) = 'object'),
      created_at timestamptz NOT NULL DEFAULT now(),
      CHECK (
        (decision = 'approve' AND next_status = 'approved') OR
        (decision = 'return' AND next_status = 'returned') OR
        (decision = 'rejudge' AND next_status = 'rejudged')
      ),
      CHECK (
        (previous_status = 'pending' AND previous_score IS NULL) OR
        (previous_status <> 'pending' AND previous_score IS NOT NULL)
      ),
      UNIQUE (review_id, revision)
    );
    CREATE INDEX review_decisions_case_idx ON review_decisions(review_id, created_at);
    ALTER TABLE attempts ADD CONSTRAINT attempts_assignment_fk
      FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE SET NULL;
    CREATE TABLE exam_import_batches (
      id uuid PRIMARY KEY,
      class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      upload_id uuid NOT NULL,
      created_by uuid NOT NULL REFERENCES users(id),
      status text NOT NULL CHECK (status IN ('queued','processing','needsCorrection','completed','failed')),
      total_rows integer NOT NULL DEFAULT 0 CHECK (total_rows >= 0),
      valid_rows integer NOT NULL DEFAULT 0 CHECK (valid_rows >= 0),
      invalid_rows integer NOT NULL DEFAULT 0 CHECK (invalid_rows >= 0),
      created_at timestamptz NOT NULL DEFAULT now(),
      completed_at timestamptz
    );
    CREATE TABLE exam_import_rows (
      id uuid PRIMARY KEY,
      batch_id uuid NOT NULL REFERENCES exam_import_batches(id) ON DELETE CASCADE,
      row_number integer NOT NULL CHECK (row_number > 0),
      student_number varchar(40),
      matched_user_id uuid REFERENCES users(id),
      exam_name varchar(160),
      occurred_on date,
      score numeric(8,3),
      max_score numeric(8,3),
      status text NOT NULL CHECK (status IN ('valid','duplicate','invalid','unmatched')),
      errors jsonb NOT NULL CHECK (jsonb_typeof(errors) = 'array'),
      UNIQUE (batch_id, row_number)
    );
    CREATE TABLE exam_records (
      id uuid PRIMARY KEY,
      batch_id uuid REFERENCES exam_import_batches(id) ON DELETE RESTRICT,
      owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      client_entity_id varchar(160) NOT NULL CHECK (client_entity_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
      profile_id uuid NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE,
      student_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      exam_name varchar(160) NOT NULL,
      occurred_on date NOT NULL,
      score numeric(8,3) NOT NULL,
      max_score numeric(8,3) NOT NULL CHECK (max_score > 0 AND score BETWEEN 0 AND max_score),
      source text NOT NULL CHECK (source IN ('manual','import')),
      knowledge_point_scores jsonb NOT NULL CHECK (jsonb_typeof(knowledge_point_scores) = 'array'),
      created_at timestamptz NOT NULL DEFAULT now(),
      CHECK ((source = 'import' AND batch_id IS NOT NULL) OR (source = 'manual' AND batch_id IS NULL))
    );
    CREATE UNIQUE INDEX exam_records_client_entity_idx
      ON exam_records(owner_user_id, client_entity_id);
    CREATE UNIQUE INDEX exam_records_import_unique_idx
      ON exam_records(batch_id, student_user_id, exam_name, occurred_on) WHERE batch_id IS NOT NULL;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DROP TABLE exam_records;
    DROP TABLE exam_import_rows;
    DROP TABLE exam_import_batches;
    ALTER TABLE attempts DROP CONSTRAINT attempts_assignment_fk;
    DROP TABLE review_decisions;
    DROP TABLE review_cases;
    DROP TABLE corrections;
    DROP TABLE submissions;
    DROP TABLE assignment_targets;
    DROP TABLE assignments;
  `);
}
