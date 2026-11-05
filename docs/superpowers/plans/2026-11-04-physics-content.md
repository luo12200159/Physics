# Physics Content Integrity and Learning Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make bundled auto-scoring defensible, textbook mappings explicit, and three pilot topics form an evidence-traceable learning loop without changing visual layout.

**Architecture:** Shared JS banks supply immutable question metadata to all three clients. `learning-engine.js` remains the scoring/evidence authority; an answer-schema module supplies only verified deterministic schemas. Versioned curriculum mappings and course activity data stay separate from persisted attempts so state v10 and question IDs are unchanged.

**Tech Stack:** Browser JavaScript, Node QA scripts, existing Android WebView packaging, Windows embedded resources.

**Spec:** `docs/superpowers/specs/2026-11-04-physics-content-portable-activation-design.md`

## Global Constraints

- Preserve every existing question ID, state v10, old `.pslab` import and offline learning.
- `review-required` is not wrong or correct until teacher review; never enter scored accuracy.
- No unreviewed draft contributes to formal mastery; no unauthorized third-party question text.
- Do not change visual layout, colors, icons, or navigation; only content and teaching behavior.
- Use official textbook versions explicitly; unresolved section mapping remains visible for review.

## Review Focus

- A unit-free answer or a free-text compound answer must not be silently auto-graded as a numeric quantity (Task 1).
- Two questions sharing a parameterized model must not count as two independent diagnostic models (Task 2).
- A user-edited stored question must not have its answer or content overwritten by bundled metadata migration (Task 2).
- Ambiguous old/new textbook sections must be reported as unresolved, not assigned by substring (Task 3).
- A simulation observation must not be called an actual laboratory measurement or proof of mastery (Tasks 4–5).

---

### Task 1: Defensible answer schemas and grading

**Files:** Create `answer-schema.js`, `tools/qa_content_answer_schema.cjs`; modify `index.html`, `learning-engine.js`, `tools/build_release.ps1`, `android/tools/build_android.ps1`.

**Interfaces:** `PhysicsStudioAnswerSchema.forQuestion(question)` returns `{ answerSchema, autoScorable, answerSchemaReviewStatus }`; `PhysicsStudioAnswerSchema.normalizeResponse(question, response)` returns a structured response only when unambiguous. `gradeFinalAnswer(question,response)` delegates to schema or returns `review-required` for unsupported subjective content.

- [ ] Write `qa_content_answer_schema.cjs` tests for verified choice, quantity with equivalent units/tolerance, multi-part order, unknown unit, missing unit, negative direction, and open/experimental review; assert `autoScorable:true` implies valid schema.
- [ ] Run `node tools/qa_content_answer_schema.cjs`; expected failure is missing production schema API.
- [ ] Implement minimal schema building/validation and guarded response normalization; package shared file for all three clients.
- [ ] Run test and `npm run qa:node`; expected both pass.
- [ ] Commit only this task's files with `feat: validate auto-scored content schemas`.

### Task 2: Bank metadata and no-loss upgrade

**Files:** Modify `original-practice-bank.js`, `curriculum-bank.js`, `mock-exam-bank.js`, `targeted-practice-bank.js`, `app.js`; create `tools/qa_content_bank_migration.cjs`.

**Interfaces:** Each bundled question carries a valid schema iff `autoScorable:true`; bank install updates only managed fields on unedited questions and metadata-only fields on user-edited questions.

- [ ] Write QA that loads all bundled banks, rejects `autoScorable:true` with missing/invalid schema, checks unique IDs and model-family independence, and upgrades old stored questions without changing answers or attempt evidence IDs.
- [ ] Run QA; expected failure is pre-existing autoScorable questions lacking schema.
- [ ] Derive schemas from verified template parameters or explicit stable answer forms; mark ambiguous/subjective questions manual; add schema and versioned metadata to safe migration fields.
- [ ] Run QA and `npm run qa:node`; expected pass.
- [ ] Commit only task files with `fix: align bundled answers and persisted question metadata`.

### Task 3: Versioned textbook section mapping and report

**Files:** Modify `curriculum-taxonomy.js`, bank metadata mapping and `app.js` as needed; create `curriculum-mapping.js`, `tools/qa_curriculum_mapping.cjs`, `tools/content_mapping_report.cjs`; emit `docs/content-mapping-report.json` and `docs/content-teacher-review.md`.

**Interfaces:** `PhysicsStudioCurriculumMapping.resolve(question)` returns `{ curriculumVersion, curriculumSectionIds, knowledgePointId, reviewStatus }`; report has one row per published question with explicit unresolved reason.

- [ ] Write tests for exact old PEP Grade 8 average-speed, Grade 9 Ohm's law, High-1 uniform acceleration mapping; ambiguous/new-version mapping is unresolved; all resolved IDs exist in taxonomy.
- [ ] Run test; expected failure is missing versioned mapping API.
- [ ] Add official-version labels and deterministic exact mapping only; do not renumber existing IDs or auto-confirm ambiguous text.
- [ ] Generate report and run mapping QA plus `npm run qa:node`; expected no invalid confirmed mappings and all missing mappings listed for review.
- [ ] Commit task files with `feat: report versioned curriculum mappings`.

### Task 4: High-1 motion pilot and four draft review

**Files:** Modify `motion-representation-drafts.js`, `physics-visuals.js` only if needed; create `teaching-sequences.js`, `tools/qa_motion_course_loop.cjs`.

**Interfaces:** `PhysicsStudioTeachingSequences.get('hs-uniformly-accelerated-motion')` returns the eight ordered stages and immutable activity/question references; draft questions remain review-gated.

- [ ] Write QA with hand-calculated draft results, unit/direction/constant-acceleration conditions, ordered stage references, independent prediction and delayed retest, and draft exclusion from published mastery.
- [ ] Run QA; expected failure is missing course sequence.
- [ ] Implement minimal data sequence using existing uniform simulation and current four drafts; add only verified original activity content.
- [ ] Run QA, `node tools/qa_motion_representation_drafts_v401.cjs`, `npm run qa:node`; expected pass.
- [ ] Commit task files with `feat: add audited uniform-motion learning sequence`.

### Task 5: Grade-8/Grade-9 loops and error-specific teacher advice

**Files:** Modify `teaching-sequences.js`, `learning-engine.js`, `learning-lab.js`, `experience-shell.js` only where existing content slots need data; create `tools/qa_content_remediation.cjs`.

**Interfaces:** `PhysicsStudioTeachingSequences.get(knowledgePointId)` provides sequences for average speed and Ohm's law; `engine.recommendTeachingIntervention(state, profileId, knowledgePointId)` returns evidence IDs, error type, suggested activity/assignment, uncertainty and `requiresTeacherConfirmation:true`.

- [ ] Write anonymous trajectory QA for concept, computation, units, missing evidence, immediate-retry vs delayed retest, and teacher confirmation.
- [ ] Run QA; expected failure is missing intervention API/course data.
- [ ] Add physically checked examples and deterministic mapping from existing error types to teaching activities; connect existing student/teacher content actions without redesigning layout.
- [ ] Run QA and full `npm run qa`; expected pass.
- [ ] Commit task files with `feat: connect pilot remediation to teacher advice`.

### Task 6: Stage reports and cross-platform content parity

**Files:** Update `docs/content-teacher-review.md`, `docs/content-mapping-report.json`, `README.md`; create `docs/content-stage-test-results.md` and QA command in `package.json`.

**Interfaces:** Report lists modified files, exact test commands/results, mapping counts, pending teacher review, unresolved items for each stage.

- [ ] Run content QA, metadata QA, Node QA, browser/mobile QA, Android dual build, Windows build; record exact outputs and failures.
- [ ] Inspect both APKs' shared JS resources and Windows bundle for parity; compare hashes, not just filenames.
- [ ] Commit only report/packaging changes with `docs: record content verification and review boundary`.
