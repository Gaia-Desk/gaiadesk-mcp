// Is this gaiadesk-cli new enough to serve MCP?
//
// `gaiadesk-cli --version --json` answers
//   {"name", "version", "features": [...], "mcp_protocol_versions": [...]}
// and its `mcp` server speaks the standard MCP lifecycle (`initialize`, ...),
// so the launcher passes stdio straight through. A CLI whose version output
// has no `mcp_protocol_versions` (it prints its version as text, or fails on
// `--json`) is too old: the launcher exits and says to update it.
//
// Pure except probeCli(), which runs the CLI once.

import { spawnSync } from 'node:child_process';

/** `gaiadesk-cli --version --json`, as far as the launcher reads it. */
export interface CliVersionInfo {
  name?: string;
  version?: string;
  features: string[];
  mcp_protocol_versions: string[];
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/**
 * The version object in `stdout`, or null when it is not one with
 * `mcp_protocol_versions` (a CLI too old to serve MCP through this launcher).
 */
export function parseVersionInfo(stdout: string): CliVersionInfo | null {
  let v: unknown;
  try {
    v = JSON.parse(stdout.trim());
  } catch {
    return null;
  }
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (!Array.isArray(o.mcp_protocol_versions)) return null;
  return {
    name: typeof o.name === 'string' ? o.name : undefined,
    version: typeof o.version === 'string' ? o.version : undefined,
    features: strings(o.features),
    mcp_protocol_versions: strings(o.mcp_protocol_versions),
  };
}

/** How long `--version --json` may take. */
export const PROBE_TIMEOUT_MS = 10_000;

/** Run `<cli> --version --json` once; null when the CLI is too old. */
export function probeCli(cli: string, env: NodeJS.ProcessEnv = process.env): CliVersionInfo | null {
  const r = spawnSync(cli, ['--version', '--json'], {
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: PROBE_TIMEOUT_MS,
    windowsHide: true,
  });
  if (r.error || r.status !== 0 || typeof r.stdout !== 'string') return null;
  return parseVersionInfo(r.stdout);
}

/** What the launcher prints when the CLI is too old. */
export function updateMessage(cli: string): string {
  return `${cli} is too old to serve MCP (its \`--version --json\` has no mcp_protocol_versions). Update gaiadesk-cli: https://gaiadesk.net/download`;
}
