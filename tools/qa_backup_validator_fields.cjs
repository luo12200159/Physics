const fs = require("fs");
const path = require("path");
const vm = require("vm");

const projectRoot = path.resolve(__dirname, "..");
const schema = JSON.parse(
  fs.readFileSync(path.join(projectRoot, "schemas", "physics-studio-backup-v4.schema.json"), "utf8")
);
const context = { window: {} };
vm.runInNewContext(
  fs.readFileSync(path.join(projectRoot, "backup-validator.js"), "utf8"),
  context
);

const properties = schema.$defs.question.properties;
const question = {
  id: "qa-question",
  title: "validator field check",
  stage: properties.stage.enum[0],
  grade: properties.grade.enum[0],
  topic: "test",
  difficulty: properties.difficulty.enum[0],
  content: "test content",
  solution: "test solution",
  modelFamilyId: "model-1",
  variantRole: "near",
  transferGroupId: "transfer-1",
  misconceptionTags: ["misconception"],
  recommendationTags: ["recommendation"],
  knowledgePointId: "kp:test",
  cognitiveDemand: "模型识别",
  representationType: "图像",
  independenceGroupId: "independence-1",
  assessmentPurpose: "practice",
  evidenceTier: "practice-variant",
  modelDefinitionId: "model-1",
  retestGroupId: "retest-1",
  diagnosticEligible: true,
  autoScorable: false,
  answerSchema: {
    answerSchemaVersion: 1,
    parts: [{
      id: "part-1", kind: "quantity", quantity: "speed",
      expected: { value: 2, unit: "m/s" },
      tolerance: { absolute: 0, relative: 0.015 },
      unitRequired: true
    }]
  },
  answerSchemaReviewStatus: "规则校验通过，待教师抽检",
  curriculumVersion: "pep-2024",
  curriculumSectionIds: ["pep-high-1-2"],
  curriculumReviewStatus: "catalog-exact",
  mappingReason: "教材目录精确对应",
  visualSpec: {
    type: "force",
    model: "newton",
    task: "根据受力图建立方程",
    parameters: { forces: [{ label: "F", x: 2, y: 0 }] }
  }
};
const payload = {
  format: "physics-studio-backup",
  version: 4,
  exportedAt: new Date().toISOString(),
  questions: [question]
};

const accepted = context.window.PhysicsStudioBackupValidator.validate(payload);
question.answerSchema.parts[0].expected.value = "not-a-number";
const invalidSchema = context.window.PhysicsStudioBackupValidator.validate(payload);
question.answerSchema.parts[0].expected.value = 2;
question.variantRole = "invalid";
const rejected = context.window.PhysicsStudioBackupValidator.validate(payload);

if (!accepted.valid || invalidSchema.valid || rejected.valid) {
  console.error(JSON.stringify({ accepted, invalidSchema, rejected }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  newFieldsAccepted: accepted.valid,
  invalidAnswerSchemaRejected: !invalidSchema.valid,
  invalidVariantRejected: !rejected.valid,
  rejectionKeyword: rejected.errors[0] && rejected.errors[0].keyword
}, null, 2));
