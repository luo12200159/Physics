"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// Native behavior cannot be exercised without an Android runtime. This check
// guards the JS/native protocol; the Android build verifies Java compilation.
const activity = fs.readFileSync(path.join(__dirname, "..", "android", "src", "com", "physicsstudio", "studyroom", "MainActivity.java"), "utf8");
const bridge = activity.slice(activity.indexOf("public void saveBase64FileWithAck("), activity.indexOf("private boolean isAllowedSecureCredentialName"));
assert.ok(bridge.startsWith("public void saveBase64FileWithAck("), "the new export bridge must accept a request ID");
assert.match(bridge, /requestId/);
assert.match(bridge, /too_large/);
assert.match(bridge, /invalid_data/);
assert.match(bridge, /busy/);

const resultHandler = activity.slice(activity.indexOf("if (requestCode == REQUEST_SAVE_ATTACHMENT)"), activity.indexOf("@Override\n    protected void onSaveInstanceState"));
assert.match(resultHandler, /"canceled"/);
assert.match(resultHandler, /"write_failed"/);
assert.match(resultHandler, /"saved"/);
assert.match(resultHandler, /try\s*\(OutputStream stream/);
const closePosition = resultHandler.indexOf("stream.flush();");
const successPosition = resultHandler.indexOf('"saved"');
assert.ok(closePosition > 0 && successPosition > closePosition, "success callback must follow stream write and close");
assert.match(activity, /PhysicsStudioAndroidExportResponse/);

console.log("qa_android_export_ack_v402: native callback contract present; Android runtime cancellation/write tests remain manual");
