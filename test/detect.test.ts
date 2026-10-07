// Telling a gaiadesk-cli that serves MCP from one too old to.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseVersionInfo, updateMessage } from '../dist/detect.js';

const NEW = JSON.stringify({
  name: 'gaiadesk-cli',
  version: '0.10.324',
  features: ['json_error_envelope', 'mcp_lifecycle', 'mcp_underscore_tool_names'],
  mcp_protocol_versions: ['2026-07-28', '2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'],
});

test('parseVersionInfo: the --version --json object', () => {
  const v = parseVersionInfo(NEW + '\n');
  assert.equal(v?.version, '0.10.324');
  assert.ok(v?.features.includes('mcp_lifecycle'));
  assert.equal(v?.mcp_protocol_versions.length, 5);
});

test('parseVersionInfo: no mcp_protocol_versions means too old', () => {
  for (const out of [
    'gaiadesk-cli 0.10.300\n',
    '',
    'null',
    '[]',
    '{"error":{"kind":"usage","message":"unknown flag"}}',
    '{"version":"1","features":["json_error_envelope"]}',
  ]) {
    assert.equal(parseVersionInfo(out), null, JSON.stringify(out));
  }
});

test('updateMessage: says to update gaiadesk-cli, with the download link', () => {
  const m = updateMessage('/usr/bin/gaiadesk-cli');
  assert.match(m, /Update gaiadesk-cli/);
  assert.match(m, /https:\/\/gaiadesk\.net\/download/);
});
