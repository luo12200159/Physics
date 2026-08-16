const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const serviceSource = path.join(root, "LanClassroomService.cs");
const nativeSource = path.join(root, "LanClassroomNative.cs");
const launcherSource = path.join(root, "Launcher.cs");
const csc = [
  "C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe",
  "C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe",
].find(fs.existsSync);

function compile(output, sources, references = []) {
  const args = [
    "/nologo",
    "/optimize+",
    "/codepage:65001",
    `/out:${output}`,
    ...references.map((item) => `/reference:${item}`),
    ...sources,
  ];
  const result = childProcess.spawnSync(csc, args, { cwd: root, encoding: "utf8", windowsHide: true });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function run(exe, args, timeout = 15_000) {
  return childProcess.spawnSync(exe, args, { encoding: "utf8", windowsHide: true, timeout });
}

function writeHarness(file) {
  fs.writeFileSync(file, String.raw`
using System;
using System.IO;
using System.Net;

internal static class LanNativeHarness
{
    private static int Main(string[] args)
    {
        Uri uri;
        if (!LanEndpointPolicy.TryBuild("http://192.168.1.20:8788", "/v1/classes", out uri)) return 10;
        if (uri.AbsoluteUri != "http://192.168.1.20:8788/v1/classes") return 11;
        if (LanEndpointPolicy.TryBuild("http://8.8.8.8:8788", "/v1/classes", out uri)) return 12;
        if (LanEndpointPolicy.TryBuild("http://192.168.1.20:8080", "/v1/classes", out uri)) return 13;
        if (LanEndpointPolicy.TryBuild("http://192.168.1.20:8788", "/admin", out uri)) return 14;
        if (LanEndpointPolicy.TryBuild("http://user:secret@192.168.1.20:8788", "/v1/classes", out uri)) return 15;

        using (LanClassroomHost host = new LanClassroomHost(
            args[0], args[1], Int32.Parse(args[2]), Int32.Parse(args[3])
        ))
        {
            LanHostStatus status = host.StartAndWait(TimeSpan.FromSeconds(8));
            if (!status.Ready || status.Port != Int32.Parse(args[2])) return 20;
            LanBridgeResponse health = LanHttpBridge.Send(new LanBridgeRequest {
                ServerUrl = "http://127.0.0.1:" + status.Port,
                Path = "/health/live",
                Method = "GET",
                BodyText = "",
                TimeoutMilliseconds = 3000
            });
            if (health.Status != 200 || health.BodyText.IndexOf("physics-studio-lan-classroom", StringComparison.Ordinal) < 0) return 21;
            string bridgeRequest = "{\"channel\":\"physics-studio-classroom\",\"requestId\":\"lan-qa-request-1\",\"action\":\"request\",\"payload\":{\"serverUrl\":\"http://127.0.0.1:8788\",\"path\":\"/health/live\",\"method\":\"GET\",\"headers\":{},\"bodyText\":\"\",\"timeoutMs\":3000}}";
            string bridgeResponse = new LanNativeMessageRouter().Handle(bridgeRequest);
            if (bridgeResponse.IndexOf("\"ok\":true", StringComparison.Ordinal) < 0
                || bridgeResponse.IndexOf("\"status\":200", StringComparison.Ordinal) < 0) return 22;
            string rejected = new LanNativeMessageRouter().Handle(bridgeRequest.Replace("127.0.0.1", "8.8.8.8"));
            if (rejected.IndexOf("lan_endpoint_rejected", StringComparison.Ordinal) < 0) return 23;
            string discoverRequest = "{\"channel\":\"physics-studio-classroom\",\"requestId\":\"lan-qa-discover-1\",\"action\":\"discover\",\"payload\":{}}";
            string discoverResponse = new LanNativeMessageRouter().Handle(discoverRequest);
            if (discoverResponse.IndexOf("http://127.0.0.1:8788", StringComparison.Ordinal) < 0) return 24;
        }
        Console.WriteLine("PASS");
        return 0;
    }
}
`, "utf8");
}

function createLauncherFixture(directory, serviceExe) {
  const files = [
    "index.html", "styles.css", "learning-lab.css", "experience-shell.css", "activation.css",
    "activation-public-key.js", "activation.js", "storage-repository.js", "curriculum-taxonomy.js",
    "curriculum-bank.js", "exam-question-index.js", "mock-exam-bank.js", "original-practice-bank.js",
    "targeted-practice-bank.js", "vendor/jsQR.js", "vendor/fflate.js", "security.js", "backup.js",
    "backup-validator.js", "ai-tutor.js", "document-import.js", "content-catalog.js", "classroom-config.js",
    "classroom-client.js", "question-answer-service.js", "learning-engine.js", "teacher-mode-lock.js", "app.js",
    "learning-lab.js", "experience-shell.js",
  ];
  for (const relative of files) {
    const target = path.join(directory, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, "", "utf8");
  }
  fs.copyFileSync(serviceExe, path.join(directory, "物理研习室-班级服务.exe"));
  fs.copyFileSync(path.join(root, "Microsoft.Web.WebView2.Core.dll"), path.join(directory, "Microsoft.Web.WebView2.Core.dll"));
  fs.copyFileSync(path.join(root, "Microsoft.Web.WebView2.WinForms.dll"), path.join(directory, "Microsoft.Web.WebView2.WinForms.dll"));
  const runtime = process.arch === "arm64" ? "win-arm64" : process.arch === "ia32" ? "win-x86" : "win-x64";
  const loaderTarget = path.join(directory, "runtimes", runtime, "native", "WebView2Loader.dll");
  fs.mkdirSync(path.dirname(loaderTarget), { recursive: true });
  fs.copyFileSync(path.join(root, "vendor", "webview2", "runtimes", runtime, "native", "WebView2Loader.dll"), loaderTarget);
}

async function main() {
  assert.ok(csc, "the .NET Framework C# compiler is required");
  assert.equal(fs.existsSync(nativeSource), true, "LanClassroomNative.cs must provide the Windows host and endpoint policy");
  const launcherText = fs.readFileSync(launcherSource, "utf8");
  assert.match(launcherText, /new LanNativeMessageRouter\(\)\.Handle\(message\)/,
    "the trusted WebView2 message path must invoke the restricted LAN router");
  assert.match(launcherText, /PostWebMessageAsJson\(response\)/,
    "the LAN router response must be returned to the requesting WebView2 page");
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "physics-windows-lan-"));
  try {
    const serviceExe = path.join(temp, "物理研习室-班级服务.exe");
    compile(serviceExe, [serviceSource], ["System.Web.Extensions.dll"]);

    const harnessSource = path.join(temp, "LanNativeHarness.cs");
    const harnessExe = path.join(temp, "LanNativeHarness.exe");
    writeHarness(harnessSource);
    compile(harnessExe, [nativeSource, harnessSource], ["System.dll", "System.Web.Extensions.dll"]);
    const port = 8788;
    const discoveryPort = await freePort();
    const dataDir = path.join(temp, "host-data");
    const harness = run(harnessExe, [serviceExe, dataDir, String(port), String(discoveryPort)]);
    assert.equal(harness.status, 0, `${harness.stdout}\n${harness.stderr}`);
    assert.match(harness.stdout, /PASS/);

    const fixture = path.join(temp, "fixture");
    fs.mkdirSync(fixture);
    createLauncherFixture(fixture, serviceExe);
    const launcherExe = path.join(fixture, "物理研习室.exe");
    compile(launcherExe, [launcherSource, nativeSource], [
      "System.Windows.Forms.dll",
      "System.Drawing.dll",
      "System.Security.dll",
      "System.Web.Extensions.dll",
      path.join(root, "Microsoft.Web.WebView2.Core.dll"),
      path.join(root, "Microsoft.Web.WebView2.WinForms.dll"),
    ]);
    assert.equal(run(launcherExe, ["--check"]).status, 0, "complete fixture must pass launcher check");
    fs.renameSync(
      path.join(fixture, "物理研习室-班级服务.exe"),
      path.join(fixture, "物理研习室-班级服务.missing"),
    );
    assert.equal(run(launcherExe, ["--check"]).status, 2, "missing service must fail launcher check");
    fs.renameSync(
      path.join(fixture, "物理研习室-班级服务.missing"),
      path.join(fixture, "物理研习室-班级服务.exe"),
    );
    const smoke = run(launcherExe, [
      "--classroom-host-smoke",
      "--classroom-data-dir", path.join(temp, "launcher-host-data"),
    ], 20_000);
    assert.equal(smoke.status, 0, `${smoke.stdout}\n${smoke.stderr}`);

    console.log(JSON.stringify({
      status: "passed",
      nativePolicy: "private-host-port-path restricted",
      hostLifecycle: "healthy child process",
      launcherRequiresService: true,
    }, null, 2));
  } finally {
    fs.rmSync(temp, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
