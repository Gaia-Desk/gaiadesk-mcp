// The legacy-handshake bridge.
//
// `gaiadesk-cli mcp` speaks the stateless MCP revision 2026-07-28: there is
// no `initialize`, and every request must carry
//   params._meta["io.modelcontextprotocol/protocolVersion"] = "2026-07-28"
//   params._meta["io.modelcontextprotocol/clientCapabilities"] = {...}
// (observed: a request without them is answered with JSON-RPC -32602).
//
// Many MCP clients still open with the older `initialize` handshake. When the
// FIRST message a client sends is `initialize`, this bridge:
//   - answers `initialize` and `ping` itself,
//   - drops client notifications (the server has nothing to do with them),
//   - adds the two `_meta` fields to every other request before passing it on.
// When the first message is anything else (a 2026-07-28 client), every byte
// passes through untouched. Server output always passes through untouched.
//
// Pure: `createBridge()` returns an object that maps one input line to the
// lines to write on each side. The stream wiring lives in bin/gaiadesk-mcp.js.

export const SERVER_PROTOCOL = '2026-07-28';
export const META_PROTOCOL_VERSION = 'io.modelcontextprotocol/protocolVersion';
export const META_CLIENT_CAPABILITIES = 'io.modelcontextprotocol/clientCapabilities';
const DEFAULT_LEGACY_VERSION = '2025-06-18';

const INSTRUCTIONS =
  'GaiaDesk desks: gaiadesk.exec runs one command and returns its exit code, stdout and stderr; ' +
  'copy_files, job_* and forward_* operate on a desk; the screen tools need gaiadesk.open_session first. ' +
  'A person at the desk can pause, take over or stop an agent at any moment.';

/**
 * @param {{ name?: string, version?: string }} [info] what to report as serverInfo
 */
export function createBridge(info = {}) {
  let mode = 'undecided'; // 'passthrough' | 'legacy'
  let clientCapabilities = {};

  function reply(id, result) {
    return JSON.stringify({ jsonrpc: '2.0', id, result });
  }

  /**
   * One line from the client. Returns { toServer: string[], toClient: string[] }.
   */
  function fromClient(line) {
    const out = { toServer: [], toClient: [] };
    const trimmed = line.trim();
    if (!trimmed) return out;
    let msg;
    try {
      msg = JSON.parse(trimmed);
    } catch {
      out.toServer.push(line); // not ours to judge; the server answers with a parse error
      return out;
    }
    if (mode === 'undecided') {
      mode = msg && msg.method === 'initialize' ? 'legacy' : 'passthrough';
    }
    if (mode === 'passthrough' || Array.isArray(msg) || typeof msg !== 'object' || msg === null) {
      out.toServer.push(line);
      return out;
    }
    const isRequest = typeof msg.method === 'string' && msg.id !== undefined && msg.id !== null;
    const isNotification = typeof msg.method === 'string' && (msg.id === undefined || msg.id === null);

    if (isNotification) return out; // e.g. notifications/initialized: dropped
    if (!isRequest) {
      out.toServer.push(line); // a response from the client: pass it on
      return out;
    }
    if (msg.method === 'initialize') {
      const p = msg.params || {};
      clientCapabilities = p.capabilities && typeof p.capabilities === 'object' ? p.capabilities : {};
      out.toClient.push(
        reply(msg.id, {
          protocolVersion: typeof p.protocolVersion === 'string' ? p.protocolVersion : DEFAULT_LEGACY_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: info.name || 'gaiadesk', version: info.version || '0.0.0' },
          instructions: INSTRUCTIONS,
        }),
      );
      return out;
    }
    if (msg.method === 'ping') {
      out.toClient.push(reply(msg.id, {}));
      return out;
    }
    const params = msg.params && typeof msg.params === 'object' && !Array.isArray(msg.params) ? { ...msg.params } : {};
    const meta = params._meta && typeof params._meta === 'object' ? { ...params._meta } : {};
    if (meta[META_PROTOCOL_VERSION] === undefined) meta[META_PROTOCOL_VERSION] = SERVER_PROTOCOL;
    if (meta[META_CLIENT_CAPABILITIES] === undefined) meta[META_CLIENT_CAPABILITIES] = clientCapabilities;
    params._meta = meta;
    out.toServer.push(JSON.stringify({ ...msg, params }));
    return out;
  }

  /** One line from the server: always passed through. */
  function fromServer(line) {
    return line;
  }

  return {
    fromClient,
    fromServer,
    get mode() {
      return mode;
    },
  };
}

/** Split a growing text buffer into complete lines; returns [lines, rest]. */
export function splitLines(buffer) {
  const parts = buffer.split('\n');
  const rest = parts.pop() ?? '';
  return [parts.map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l)), rest];
}
