// The legacy-handshake bridge, for a gaiadesk-cli from before 0.10.324.
//
// gaiadesk-cli 0.10.324 and newer answer the standard `initialize` handshake
// themselves (`--version --json` lists `mcp_lifecycle`); the launcher passes
// their stdio through untouched and never uses this bridge (detect.ts).
//
// An older `gaiadesk-cli mcp` speaks only the stateless MCP revision
// 2026-07-28: there is no `initialize`, and every request must carry
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
// lines to write on each side. The stream wiring lives in bin.ts.

export const SERVER_PROTOCOL = '2026-07-28';
export const META_PROTOCOL_VERSION = 'io.modelcontextprotocol/protocolVersion';
export const META_CLIENT_CAPABILITIES = 'io.modelcontextprotocol/clientCapabilities';
const DEFAULT_LEGACY_VERSION = '2025-06-18';

/** What to report as serverInfo to a legacy client. */
export interface ServerInfo {
  name?: string;
  version?: string;
}

/** The lines one input line turns into, for each side. */
export interface BridgeOutput {
  toServer: string[];
  toClient: string[];
}

export type BridgeMode = 'undecided' | 'passthrough' | 'legacy';

export interface Bridge {
  /** One line from the client. */
  fromClient(line: string): BridgeOutput;
  /** One line from the server: always passed through. */
  fromServer(line: string): string;
  /** Decided by the client's first message. */
  readonly mode: BridgeMode;
}

type Json = Record<string, unknown>;

function isObj(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// The tool names of the CLIs this bridge serves (before 0.10.324) are dotted.
const INSTRUCTIONS =
  'GaiaDesk desks: gaiadesk.exec runs one command and returns its exit code, stdout and stderr; ' +
  'copy_files, job_* and forward_* operate on a desk; the screen tools need gaiadesk.open_session first. ' +
  'A person at the desk can pause, take over or stop an agent at any moment.';

export function createBridge(info: ServerInfo = {}): Bridge {
  let mode: BridgeMode = 'undecided';
  let clientCapabilities: Json = {};

  function reply(id: unknown, result: Json): string {
    return JSON.stringify({ jsonrpc: '2.0', id, result });
  }

  function fromClient(line: string): BridgeOutput {
    const out: BridgeOutput = { toServer: [], toClient: [] };
    const trimmed = line.trim();
    if (!trimmed) return out;
    let msg: unknown;
    try {
      msg = JSON.parse(trimmed);
    } catch {
      out.toServer.push(line); // not ours to judge; the server answers with a parse error
      return out;
    }
    if (mode === 'undecided') {
      mode = isObj(msg) && msg.method === 'initialize' ? 'legacy' : 'passthrough';
    }
    if (mode === 'passthrough' || !isObj(msg)) {
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
      const p = isObj(msg.params) ? msg.params : {};
      clientCapabilities = isObj(p.capabilities) ? p.capabilities : {};
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
    const params: Json = isObj(msg.params) ? { ...msg.params } : {};
    const meta: Json = isObj(params._meta) ? { ...params._meta } : {};
    if (meta[META_PROTOCOL_VERSION] === undefined) meta[META_PROTOCOL_VERSION] = SERVER_PROTOCOL;
    if (meta[META_CLIENT_CAPABILITIES] === undefined) meta[META_CLIENT_CAPABILITIES] = clientCapabilities;
    params._meta = meta;
    out.toServer.push(JSON.stringify({ ...msg, params }));
    return out;
  }

  function fromServer(line: string): string {
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
export function splitLines(buffer: string): [string[], string] {
  const parts = buffer.split('\n');
  const rest = parts.pop() ?? '';
  return [parts.map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l)), rest];
}
