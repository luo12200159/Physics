const fs = require("fs");
const path = require("path");
const Ajv2020 = require("ajv/dist/2020").default;
const standaloneCode = require("ajv/dist/standalone").default;

const projectRoot = path.resolve(__dirname, "..");
const schemaPath = path.join(projectRoot, "schemas", "physics-studio-backup-v4.schema.json");
const outputPath = path.join(projectRoot, "backup-validator.js");
const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  allowUnionTypes: true,
  code: { source: true, esm: false },
  formats: { "date-time": true }
});
const validate = ajv.compile(schema);
const generated = standaloneCode(ajv, validate);
const browserModule = `(() => {
  "use strict";
  const module = { exports: {} };
  const exports = module.exports;
  const ucs2length = (value) => {
    let length = 0;
    let index = 0;
    while (index < value.length) {
      const lead = value.charCodeAt(index);
      index += 1;
      if (lead >= 0xd800 && lead <= 0xdbff && index < value.length) {
        const trail = value.charCodeAt(index);
        if (trail >= 0xdc00 && trail <= 0xdfff) index += 1;
      }
      length += 1;
    }
    return length;
  };
  const require = (name) => {
    if (name === "ajv/dist/runtime/ucs2length") return { default: ucs2length };
    throw new Error(\`Unsupported validator runtime: \${name}\`);
  };
${generated}
  const validate = module.exports;
  window.PhysicsStudioBackupValidator = Object.freeze({
    version: "4.0.0",
    validate(payload) {
      const valid = validate(payload);
      return {
        valid: Boolean(valid),
        errors: (validate.errors || []).map((error) => ({
          path: error.instancePath || "/",
          keyword: error.keyword,
          message: error.message || "字段不符合要求"
        }))
      };
    }
  });
})();
`;
fs.writeFileSync(outputPath, browserModule, "utf8");
console.log(outputPath);
