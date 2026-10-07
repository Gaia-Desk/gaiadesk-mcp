import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createBridge, splitLines, SERVER_PROTOCOL, META_PROTOCOL_VERSION, META_CLIENT_CAPABILITIES } from '../dist/bridge.js';

const line = (o: unknown) => JSON.stringify(o);

test('a 2026-07-28 client passes through byte for byte', () => {
  const b = createBridge();
  const first = line({ jsonrpc: '2.0', id: 1, method: 'server/discover', params: { _meta: { [META_PROTOCOL_VERSION]: SERVER_PROTOCOL, [META_CLIENT_CAPABILITIES]: {} } } });
  assert.deepEqual(b.fromClient(first), { toServer: [first], toClient: [] });
  assert.equal(b.mode, 'passthrough');
  const note = line({ jsonrpc: '2.0', method: 'notifications/cancelled', params: {} });
  assert.deepEqual(b.fromClient(note), { toServer: [note], toClient: [] }, 'notifications too');
  const init = line({ jsonrpc: '2.0', id: 2, method: 'initialize', params: {} });
  assert.deepEqual(b.fromClient(init).toServer, [init], 'mode is decided once, by the first message');
});

test('a legacy client: initialize and ping are answered here', () => {
  const b = createBridge({ name: 'gaiadesk', version: '9.9.9' });
  const r = b.fromClient(line({ jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: { roots: {} }, clientInfo: { name: 'x' } } }));
  assert.equal(b.mode, 'legacy');
  assert.deepEqual(r.toServer, []);
  const reply = JSON.parse(r.toClient[0]);
  assert.equal(reply.id, 0);
  assert.equal(reply.result.protocolVersion, '2025-06-18', 'echoes the version the client asked for');
  assert.deepEqual(reply.result.capabilities, { tools: { listChanged: false } });
  assert.deepEqual(reply.result.serverInfo, { name: 'gaiadesk', version: '9.9.9' });

  assert.deepEqual(b.fromClient(line({ jsonrpc: '2.0', method: 'notifications/initialized' })), { toServer: [], toClient: [] });
  const ping = b.fromClient(line({ jsonrpc: '2.0', id: 'p', method: 'ping' }));
  assert.deepEqual(JSON.parse(ping.toClient[0]), { jsonrpc: '2.0', id: 'p', result: {} });
});

test('a legacy client: every other request gets the required _meta', () => {
  const b = createBridge();
  b.fromClient(line({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { capabilities: { sampling: {} } } }));
  const r = b.fromClient(line({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'gaiadesk.exec', arguments: { desk_id: '1', command: 'hostname' } } }));
  const sent = JSON.parse(r.toServer[0]);
  assert.equal(sent.params._meta[META_PROTOCOL_VERSION], SERVER_PROTOCOL);
  assert.deepEqual(sent.params._meta[META_CLIENT_CAPABILITIES], { sampling: {} });
  assert.deepEqual(sent.params.arguments, { desk_id: '1', command: 'hostname' });

  const list = JSON.parse(b.fromClient(line({ jsonrpc: '2.0', id: 3, method: 'tools/list' })).toServer[0]);
  assert.equal(list.params._meta[META_PROTOCOL_VERSION], SERVER_PROTOCOL, 'a request with no params gets them too');

  const own = JSON.parse(
    b.fromClient(line({ jsonrpc: '2.0', id: 4, method: 'tools/list', params: { _meta: { [META_PROTOCOL_VERSION]: 'mine', progressToken: 7 } } })).toServer[0],
  );
  assert.equal(own.params._meta[META_PROTOCOL_VERSION], 'mine', 'a value the client set is kept');
  assert.equal(own.params._meta.progressToken, 7);
});

test('a legacy client: unparseable lines and responses pass through', () => {
  const b = createBridge();
  b.fromClient(line({ jsonrpc: '2.0', id: 1, method: 'initialize' }));
  assert.deepEqual(b.fromClient('not json').toServer, ['not json']);
  const resp = line({ jsonrpc: '2.0', id: 9, result: {} });
  assert.deepEqual(b.fromClient(resp).toServer, [resp]);
  assert.deepEqual(b.fromClient('   '), { toServer: [], toClient: [] });
});

test('server output is never altered', () => {
  const b = createBridge();
  const s = line({ jsonrpc: '2.0', id: 1, result: { resultType: 'complete', tools: [] } });
  assert.equal(b.fromServer(s), s);
});

test('splitLines keeps the partial tail and strips CR', () => {
  assert.deepEqual(splitLines('a\r\nb\nc'), [['a', 'b'], 'c']);
  assert.deepEqual(splitLines('x'), [[], 'x']);
});
