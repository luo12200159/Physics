const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto, createHash } = require('node:crypto');

(async () => {
  const root = path.resolve(__dirname, '..');
  const keys = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true,
    ['sign', 'verify']);
  const spki = Buffer.from(await webcrypto.subtle.exportKey('spki', keys.publicKey));
  const trusted = { version: 1, product: 'physics-studio', algorithm: 'ECDSA_P256_SHA256',
    spkiBase64: spki.toString('base64'),
    fingerprintSha256: createHash('sha256').update(spki).digest('hex').toUpperCase() };
  const context = { console, crypto: webcrypto, TextDecoder, TextEncoder, Uint8Array, Promise,
    atob, btoa, setTimeout, clearTimeout, Date, Map, Set, Object, String };
  context.window = context;
  context.PHYSICS_STUDIO_ACTIVATION_PUBLIC_KEY = trusted;
  context.document = { readyState: 'loading', addEventListener() {} };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, 'activation.js'), 'utf8'), context);
  const api = context.PhysicsStudioActivation;
  const deviceA = 'A'.repeat(64);
  const deviceB = 'B'.repeat(64);
  const encode = (value) => Buffer.from(value).toString('base64url');
  const issue = async (payload) => {
    const bytes = Buffer.from(JSON.stringify(payload));
    const signature = Buffer.from(await webcrypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' },
      keys.privateKey, bytes));
    assert.equal(signature.length, 64);
    return `PSA1.${encode(bytes)}.${encode(signature)}`;
  };
  const base = { v: 1, product: 'physics-studio', licenseId: 'a'.repeat(32),
    issuedAt: '2026-01-01T00:00:00.000Z', expiresAt: null, note: 'qa' };
  const legacy = await issue({ ...base, device: deviceA });
  assert.equal((await api.validateCode(legacy, deviceA)).device, deviceA);
  await assert.rejects(api.validateCode(legacy, deviceB), /另一台设备/);
  const portable = await issue({ ...base, scope: 'portable', kid: trusted.fingerprintSha256.slice(0, 16) });
  assert.equal((await api.validateCode(portable, deviceA)).scope, 'portable');
  assert.equal((await api.validateCode(portable, deviceB)).scope, 'portable');
  await assert.rejects(api.validateCode(await issue({ ...base, scope: 'unknown' }), deviceA),
    /不支持|格式/);
  await assert.rejects(api.validateCode(await issue({ ...base, scope: 'portable',
    expiresAt: '2026-01-02T00:00:00.000Z' }), deviceA), /过期/);
  const parts = portable.split('.');
  const changed = `PSA1.${encode(Buffer.from(JSON.stringify({ ...base, scope: 'portable', note: 'tampered' })))}.${parts[2]}`;
  await assert.rejects(api.validateCode(changed, deviceA), /签名/);
  console.log('qa_portable_activation: passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
