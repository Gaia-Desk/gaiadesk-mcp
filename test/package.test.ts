// What npm publishes: the bin and the exports point at built files, and the
// bin starts with a shebang (npm links it as an executable).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const pkg = JSON.parse(readFileSync(`${ROOT}package.json`, 'utf8')) as {
  bin: Record<string, string>;
  exports: Record<string, string | { types: string; import: string }>;
  files: string[];
};

test('bin: dist/bin.js, built, with a shebang', () => {
  assert.deepEqual(Object.keys(pkg.bin), ['gaiadesk-mcp']);
  const bin = pkg.bin['gaiadesk-mcp'];
  assert.ok(bin.startsWith('dist/'), 'the bin is in a published directory');
  assert.ok(pkg.files.includes('dist/'));
  assert.ok(readFileSync(`${ROOT}${bin}`, 'utf8').startsWith('#!/usr/bin/env node\n'));
});

test('exports: every entry exists, with its types', async () => {
  for (const [key, target] of Object.entries(pkg.exports)) {
    if (typeof target === 'string') {
      assert.ok(existsSync(`${ROOT}${target}`), key);
      continue;
    }
    assert.ok(existsSync(`${ROOT}${target.import}`), `${key} import`);
    assert.ok(existsSync(`${ROOT}${target.types}`), `${key} types`);
  }
  const locate = await import('@gaiadesk/mcp/locate');
  assert.equal(locate.DOWNLOAD_URL, 'https://gaiadesk.net/download');
  const bridge = await import('@gaiadesk/mcp/bridge');
  assert.equal(bridge.SERVER_PROTOCOL, '2026-07-28');
  const detect = await import('@gaiadesk/mcp/detect');
  assert.equal(typeof detect.launchMode, 'function');
});
