const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const childProcess = require("node:child_process");

function loadPlaywright() {
  try {
    return require("playwright-core");
  } catch (coreError) {
    try {
      return require("playwright");
    } catch (fullError) {
      // Release/QA builds keep the pinned browser driver in the local build
      // cache so a clean checkout does not need a global npm install.
      try {
        return require(path.join(__dirname, "..", ".build", "qa-node", "node_modules", "playwright-core"));
      } catch (_cachedError) {
        // Report the original dependency error below.
      }
      const error = new Error(
        "Browser QA requires playwright-core or playwright. Run npm install before browser QA.",
      );
      error.cause = { coreError, fullError };
      throw error;
    }
  }
}

function commandPath(command) {
  try {
    const lookup = process.platform === "win32" ? "where.exe" : "which";
    const result = childProcess.execFileSync(lookup, [command], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true,
    });
    return result.split(/\r?\n/).map((item) => item.trim()).find(Boolean) ?? null;
  } catch {
    return null;
  }
}

function candidateExecutables() {
  const candidates = [];
  if (process.env.PLAYWRIGHT_EXECUTABLE_PATH) {
    candidates.push(process.env.PLAYWRIGHT_EXECUTABLE_PATH);
  }
  if (process.env.CHROME_PATH) candidates.push(process.env.CHROME_PATH);
  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA;
    const programFiles = process.env.ProgramFiles;
    const programFilesX86 = process.env["ProgramFiles(x86)"];
    for (const root of [localAppData, programFiles, programFilesX86]) {
      if (!root) continue;
      candidates.push(
        path.join(root, "Microsoft", "Edge", "Application", "msedge.exe"),
        path.join(root, "Google", "Chrome", "Application", "chrome.exe"),
        path.join(root, "Chromium", "Application", "chrome.exe"),
      );
    }
  } else if (process.platform === "darwin") {
    candidates.push(
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
    );
  } else {
    candidates.push(
      "/usr/bin/microsoft-edge",
      "/usr/bin/google-chrome",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
    );
  }
  for (const command of ["msedge", "microsoft-edge", "chrome", "google-chrome", "chromium", "chromium-browser"]) {
    const resolved = commandPath(command);
    if (resolved) candidates.push(resolved);
  }
  return [...new Set(candidates)].filter((candidate) => fs.existsSync(candidate));
}

function launchBrowser(options = {}) {
  const { chromium } = loadPlaywright();
  const channel = process.env.PLAYWRIGHT_CHANNEL;
  if (channel && !options.executablePath) {
    return chromium.launch({ ...options, channel });
  }
  const executablePath = options.executablePath ?? candidateExecutables()[0];
  const launchOptions = { ...options };
  if (executablePath) launchOptions.executablePath = executablePath;
  return chromium.launch(launchOptions);
}

async function installQaActivationStub(page, licenseId = "browser-qa") {
  await page.route("**/activation.js", async (route) => {
    await route.fulfill({
      contentType: "text/javascript; charset=utf-8",
      body: `(() => {
        const whenActivated = Promise.resolve({ licenseId: ${JSON.stringify(licenseId)}, expiresAt: 0 });
        window.PhysicsStudioActivation = Object.freeze({
          version: ${JSON.stringify(licenseId)},
          whenActivated,
          validateCode: async () => true,
          formatDeviceRequest: (value) => String(value || ""),
          publicKeyFingerprint: ${JSON.stringify(licenseId)}
        });
        const unlock = () => {
          document.body.classList.remove("activation-pending");
          document.body.classList.add("activation-complete");
        };
        document.readyState === "loading"
          ? document.addEventListener("DOMContentLoaded", unlock, { once: true })
          : unlock();
      })();`
    });
  });
}

module.exports = {
  candidateExecutables,
  installQaActivationStub,
  launchBrowser,
  loadPlaywright,
};
