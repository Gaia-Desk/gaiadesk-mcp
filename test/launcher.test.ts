// End to end: the built launcher (dist/bin.js), with $GAIADESK_CLI pointing
// at a fake `gaiadesk-cli` (an executable shell script running the compiled
// fixture, so POSIX only; the missing-CLI test runs everywhere).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = fileURLToPath(new URL('../dist/bin.js', import.meta.url));
const FIXTURE = fileURLToPath(new URL('./fixtures/fake-gaiadesk-cli.js', import.meta.url));
const posix = process.platform !== 'win32';

/** An executable `gaiadesk-cli` stand-in: exec node on the compiled fixture. */
function makeFake(): string {
  const file = join(mkdtempSync(join(tmpdir(), 'gaiadesk-mcp-')), 'gaiadesk-cli');
  const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
  writeFileSync(file, `#!/bin/sh\nexec ${q(process.execPath)} ${q(FIXTURE)} "$@"\n`);
  chmodSync(file, 0o755);
  return file;
}
const FAKE = posix ? makeFake() : '';

interface Ran {
  code: number | null;
  out: string;
  err: string;
}

function run(args: string[], input: string, env: Record<string, string> = {}): Promise<Ran> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [BIN, ...args], { env: { ...process.env, GAIADESK_CLI: FAKE, ...env } });
    let out = '';
    let err = '';
    child.stdout.on('data', (d: Buffer) => (out += d));
    child.stderr.on('data', (d: Buffer) => (err += d));
    child.on('close', (code) => resolve({ code, out, err }));
    child.stdin.end(input);
  });
}

const lines = (s: string) => s.split('\n').filter(Boolean).map((l) => JSON.parse(l));

test('--which prints the CLI it would run', { skip: !posix }, async () => {
  const r = await run(['--which'], '');
  assert.equal(r.code, 0);
  assert.equal(r.out.trim(), FAKE);
});

test('runs `gaiadesk-cli mcp <args>` and bridges a legacy client to an older CLI', { skip: !posix }, async () => {
  const input =
    [
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {} } },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    ]
      .map((m) => JSON.stringify(m))
      .join('\n') + '\n';
  const r = await run(['--audit-dir', '/tmp/x'], input);
  assert.equal(r.code, 0, r.err);
  const [init, list] = lines(r.out);
  assert.equal(init.id, 1);
  assert.equal(init.result.serverInfo.name, 'gaiadesk');
  assert.equal(list.id, 2);
  assert.deepEqual(list.result.argv, ['mcp', '--audit-dir', '/tmp/x']);
  assert.equal(list.result.saw.params._meta['io.modelcontextprotocol/protocolVersion'], '2026-07-28');
});

test('passes a 2026-07-28 client through untouched', { skip: !posix }, async () => {
  const msg = { jsonrpc: '2.0', id: 'a', method: 'server/discover', params: { _meta: { x: 1 } } };
  const r = await run([], JSON.stringify(msg) + '\n');
  assert.deepEqual(lines(r.out)[0].result.saw, msg);
});

test('GAIADESK_MCP_BRIDGE=off is pure stdio passthrough', { skip: !posix }, async () => {
  const msg = { jsonrpc: '2.0', id: 5, method: 'initialize', params: {} };
  const r = await run([], JSON.stringify(msg) + '\n', { GAIADESK_MCP_BRIDGE: 'off' });
  assert.deepEqual(lines(r.out)[0].result.saw, msg, 'initialize reached the CLI unchanged');
});

const legacyInit = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {} } };

test('a CLI that speaks the standard lifecycle (0.10.324+): initialize reaches it untouched', { skip: !posix }, async () => {
  const log = join(mkdtempSync(join(tmpdir(), 'gaiadesk-mcp-')), 'probe.log');
  const input = [legacyInit, { jsonrpc: '2.0', method: 'notifications/initialized' }, { jsonrpc: '2.0', id: 2, method: 'tools/list' }]
    .map((m) => JSON.stringify(m))
    .join('\n') + '\n';
  const r = await run(['--audit-dir', '/tmp/x'], input, { FAKE_VERSION: 'json', FAKE_LOG: log });
  assert.equal(r.code, 0, r.err);
  const [init, list] = lines(r.out);
  assert.deepEqual(init.result.saw, legacyInit, 'no bridge: the CLI answered initialize itself');
  assert.deepEqual(list.result.saw, { jsonrpc: '2.0', id: 2, method: 'tools/list' }, 'no _meta added');
  assert.deepEqual(list.result.argv, ['mcp', '--audit-dir', '/tmp/x']);
  assert.deepEqual(lines(readFileSync(log, 'utf8')), [['--version', '--json']], 'probed once, with --version --json');
});

test('an older CLI is bridged: text from --version, an unknown-flag error, or a stateless-only server', { skip: !posix }, async () => {
  for (const FAKE_VERSION of ['', 'error', 'v2only']) {
    const r = await run([], JSON.stringify(legacyInit) + '\n', { FAKE_VERSION });
    assert.equal(r.code, 0, `${FAKE_VERSION}: ${r.err}`);
    const [init] = lines(r.out);
    assert.equal(init.result.serverInfo?.name, 'gaiadesk', `${FAKE_VERSION || 'text'}: the bridge answered initialize`);
    assert.equal(init.result.saw, undefined);
  }
});

test('GAIADESK_MCP_BRIDGE=on bridges even a new CLI, without probing', { skip: !posix }, async () => {
  const log = join(mkdtempSync(join(tmpdir(), 'gaiadesk-mcp-')), 'probe.log');
  const r = await run([], JSON.stringify(legacyInit) + '\n', { FAKE_VERSION: 'json', FAKE_LOG: log, GAIADESK_MCP_BRIDGE: 'on' });
  assert.equal(lines(r.out)[0].result.serverInfo?.name, 'gaiadesk');
  assert.equal(existsSync(log), false, 'no --version probe');
});

test("the CLI's exit code is the launcher's", { skip: !posix }, async () => {
  const r = await run([], '', { FAKE_EXIT: '3' });
  assert.equal(r.code, 3);
});

test('a missing CLI: exit 127 and the download link', async () => {
  const r = await run([], '', { GAIADESK_CLI: '/nonexistent/gaiadesk-cli' });
  assert.equal(r.code, 127);
  assert.match(r.err, /https:\/\/gaiadesk\.net\/download/);
});
