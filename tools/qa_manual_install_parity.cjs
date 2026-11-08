const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const launcher = fs.readFileSync(path.join(root, 'Launcher.cs'), 'utf8');
const installer = fs.readFileSync(path.join(root, '安装应用.ps1'), 'utf8');
assert.match(installer, /\[string\]\$InstallDirectory/, 'installer must expose isolated install directory');
assert.match(installer, /\[switch\]\$SkipShortcuts/, 'installer must support side-effect-free QA');
const scripts = Array.from(html.matchAll(/<script\s+src="([^"]+)"/g), (match) => match[1]);
const styles = Array.from(html.matchAll(/<link\s+[^>]*href="([^"]+\.css)"/g), (match) => match[1]);
const expected = [...scripts, ...styles, '物理研习室-班级服务.exe'];
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'physics-manual-install-'));
const install = path.join(temp, 'app');

try {
  const result = spawnSync('powershell.exe', [
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, '安装应用.ps1'),
    '-InstallDirectory', install, '-SkipShortcuts'
  ], { cwd: root, encoding: 'utf8', timeout: 120000 });
  assert.equal(result.status, 0, `manual installer failed: ${result.stderr || result.stdout}`);
  for (const relative of expected) {
    assert.ok(fs.existsSync(path.join(install, relative)), `manual install missing ${relative}`);
    if (relative.endsWith('.js')) {
      assert.ok(launcher.replaceAll('\\', '/').includes(`"${relative}"`), `launcher does not check ${relative}`);
    }
  }
  console.log(`Manual installer parity passed: ${scripts.length} scripts, ${styles.length} styles, LAN service`);
} finally {
  if (temp.startsWith(os.tmpdir() + path.sep)) fs.rmSync(temp, { recursive: true, force: true });
}
