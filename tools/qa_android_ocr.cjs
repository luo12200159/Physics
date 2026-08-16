const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const project = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(project, relative), "utf8");
const activity = read("android/src/com/physicsstudio/studyroom/MainActivity.java");
const androidBuild = read("android/tools/build_android.ps1");
const shell = read("experience-shell.js");

// The native shell must expose an explicit, machine-readable capability boundary.
// This build deliberately reports unavailable because no offline OCR model/library is
// bundled by the dependency-free android.jar build. Returning invented text is forbidden.
assert.match(activity, /@JavascriptInterface\s+public String getOcrCapability\(\)/);
assert.match(activity, /capability\.put\("available", false\)/);
assert.match(activity, /capability\.put\("engine", "none"\)/);
assert.match(activity, /offline_ocr_engine_not_bundled/);
assert.match(activity, /@JavascriptInterface\s+public String ocrImage\(String imageDataUrl\)/);
assert.match(activity, /result\.put\("text", ""\)/);
assert.match(activity, /result\.put\("blocks", new JSONArray\(\)\)/);
assert.match(activity, /result\.put\("engine", "none"\)/);
assert.match(activity, /result\.put\("error", error\)/);
assert.match(activity, /MAX_OCR_IMAGE_DATA_URL_LENGTH/);

// No Gradle/Maven/AAR integration exists in the current raw Android build. The
// capability must therefore remain unavailable until a real offline engine is packaged.
assert.doesNotMatch(androidBuild, /(?:tesseract|mlkit|text-recognition|\.aar)/i);

const recognizeStart = shell.indexOf("async function recognizeCaptureText()");
const nativeCall = shell.indexOf("tryAndroidNativeCaptureOcr(canvas)", recognizeStart);
const detectorFallback = shell.indexOf('typeof window.TextDetector !== "function"', recognizeStart);
assert.ok(recognizeStart >= 0 && nativeCall > recognizeStart, "capture flow must try Android OCR");
assert.ok(detectorFallback > nativeCall, "TextDetector must be a fallback after Android OCR");
assert.match(shell, /bridge\.ocrImage\(imageDataUrl\)/);
assert.match(shell, /confidence < 0\.8 \? `□\$\{text\}` : text/);
assert.match(shell, /公式、上下标、矢量和图示必须逐项核对/);
assert.match(shell, /function invalidateCaptureConfirmation\(/);
assert.match(shell, /ui\.capture\?\.confirmedText !== text/);
assert.match(shell, /studentCaptureConfirmed[\s\S]{0,500}confirmedText/);

console.log(JSON.stringify({
  status: "passed",
  recognitionOrder: ["android-native-capability", "TextDetector", "manual"],
  nativeEngine: "not bundled; explicit unsupported response verified",
  manualConfirmation: "required after image/OCR/text changes"
}, null, 2));
