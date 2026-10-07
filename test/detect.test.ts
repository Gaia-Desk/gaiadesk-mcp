// Telling a gaiadesk-cli that speaks the standard MCP lifecycle (0.10.324+)
// from an older one that needs the bridge.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { launchMode, parseVersionInfo, speaksStandardMcp } from '../dist/detect.js';
import type { CliVersionInfo } from '../dist/detect.js';

const NEW = JSON.stringify({
  name: 'gaiadesk-cli',
  version: '0.10.324',
  features: ['json_error_envelope', 'mcp_lifecycle', 'mcp_underscore_tool_names'],
  json_shapes: ['v1', 'v2'],
  mcp_protocol_versions: ['2026-07-28', '2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'],
});

test('parseVersionInfo: the --version --json object', () => {
  const v = parseVersionInfo(NEW + '\n');
  assert.equal(v?.version, '0.10.324');
  assert.ok(v?.features.includes('mcp_lifecycle'));
  assert.equal(v?.mcp_protocol_versions.length, 5);
});

test('parseVersionInfo: an older CLI is no version object', () => {
  for (const out of ['gaiadesk-cli 0.10.300\n', '', 'null', '[]', '{"error":{"kind":"usage","message":"unknown flag"}}', '{"version":"1"}']) {
    assert.equal(parseVersionInfo(out), null, JSON.stringify(out));
  }
});

test('speaksStandardMcp: the mcp_lifecycle feature, or a revision besides 2026-07-28', () => {
  const v = (features: string[], mcp: string[]): CliVersionInfo => ({ features, json_shapes: [], mcp_protocol_versions: mcp });
  assert.equal(speaksStandardMcp(parseVersionInfo(NEW)), true);
  assert.equal(speaksStandardMcp(v(['mcp_lifecycle'], [])), true);
  assert.equal(speaksStandardMcp(v([], ['2026-07-28', '2025-06-18'])), true);
  assert.equal(speaksStandardMcp(v([], ['2026-07-28'])), false, 'stateless only: still needs the bridge');
  assert.equal(speaksStandardMcp(v([], [])), false);
  assert.equal(speaksStandardMcp(null), false);
});

test('launchMode: GAIADESK_MCP_BRIDGE decides first, then the probe', () => {
  const newCli = () => parseVersionInfo(NEW);
  const oldCli = () => null;
  const never = (): CliVersionInfo | null => {
    throw new Error('probed');
  };
  assert.equal(launchMode('off', never), 'passthrough');
  assert.equal(launchMode('OFF', never), 'passthrough');
  assert.equal(launchMode('on', never), 'bridge');
  assert.equal(launchMode(undefined, newCli), 'passthrough');
  assert.equal(launchMode('', oldCli), 'bridge');
});
