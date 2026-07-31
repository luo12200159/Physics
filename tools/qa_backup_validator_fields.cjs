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
  recommendationTags: ["recommendation"]
};
const payload = {
  format: "physics-studio-backup",
  version: 4,
  exportedAt: new Date().toISOString(),
  questions: [question]
};

const accepted = context.window.PhysicsStudioBackupValidator.validate(payload);
question.variantRole = "invalid";
const rejected = context.window.PhysicsStudioBackupValidator.validate(payload);

if (!accepted.valid || rejected.valid) {
  console.error(JSON.stringify({ accepted, rejected }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  newFieldsAccepted: accepted.valid,
  invalidVariantRejected: !rejected.valid,
  rejectionKeyword: rejected.errors[0] && rejected.errors[0].keyword
}, null, 2));
