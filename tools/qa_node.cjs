const childProcess = require("node:child_process");
const path = require("node:path");

const project = path.resolve(__dirname, "..");
const scripts = [
  "qa_activation_and_1900.cjs",
  "qa_backup_validator_fields.cjs",
  "qa_classroom_client.cjs",
  "qa_class_invite_join.cjs",
  "qa_classroom_lan_transport.cjs",
  "qa_lan_classroom_service.cjs",
  "qa_windows_lan_classroom.cjs",
  "qa_learning_engine.cjs",
  "qa_review_evidence_integrity.cjs",
  "qa_physics_visuals.cjs",
  "qa_variant_generator.cjs",
  "qa_variant_ui_sync.cjs",
  "qa_learning_p0.cjs",
  "qa_identity_isolation.cjs",
  "qa_placement_status.cjs",
  "qa_placement_blueprint.cjs",
  "qa_manual_review_scoring.cjs",
  "qa_intervention_comparison.cjs",
  "qa_intervention_sessions.cjs",
  "qa_privacy_boundary.cjs",
  "qa_teacher_lock.cjs",
  "qa_storage_migration.cjs",
  "qa_version_source.cjs",
  "qa_android_export_filename.cjs",
  "qa_android_ocr.cjs",
  "qa_edge_preference.cjs",
  "qa_question_metadata.cjs",
  "qa_mock_exam_bank.cjs",
  "qa_responsive_performance.cjs",
  "qa_release_packaging.cjs",
  "qa_release_zip_portability.cjs",
  "qa_exam_question_import.cjs",
  "qa_teacher_structure.cjs",
  "qa_ai_tutor_turn.cjs",
  "qa_targeted_coverage.cjs",
  "qa_tiered_assignment.cjs",
  "qa_targeted_learning.cjs",
  "qa_student_diagnosis.cjs",
  "qa_classroom_offline_create.cjs",
  "qa_v3_classroom.cjs",
  "qa_dual_android_apps.cjs",
  "qa_dual_visual_models.cjs",
];

for (const script of scripts) {
  const result = childProcess.spawnSync(process.execPath, [path.join(__dirname, script)], {
    cwd: project,
    encoding: "utf8",
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Pure Node QA failed: ${script} (exit ${result.status})`);
  }
}

console.log(`Pure Node QA passed: ${scripts.length} scripts`);
