// Does this gaiadesk-cli speak the standard MCP lifecycle itself?
//
// gaiadesk-cli 0.10.324 and newer answer `gaiadesk-cli --version --json` with
//   {"name", "version", "features": [...], "json_shapes": [...], "mcp_protocol_versions": [...]}
// and their `mcp` server accepts the standard `initialize` handshake beside the
// stateless 2026-07-28 revision, so the launcher passes stdio straight through.
// An older CLI does not understand `--version --json` (it prints its version as
// text, or fails): it gets the legacy-handshake bridge (bridge.ts).
//
// Pure except probeCli(), which runs the CLI once.

import { spawnSync } from 'node:child_process';

import { SERVER_PROTOCOL } from './bridge.js';

/** `gaiadesk-cli --version --json`, as far as the launcher reads it. */
export interface CliVersionInfo {
  name?: string;
  version?: string;
  features: string[];
  json_shapes: string[];
  mcp_protocol_versions: string[];
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/**
 * The version object in `stdout`, or null when it is not one (an older CLI's
 * `gaiadesk-cli 0.10.300` text, an error, nothing).
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
  if (!Array.isArray(o.features) && !Array.isArray(o.mcp_protocol_versions)) return null;
  return {
    name: typeof o.name === 'string' ? o.name : undefined,
    version: typeof o.version === 'string' ? o.version : undefined,
    features: strings(o.features),
    json_shapes: strings(o.json_shapes),
    mcp_protocol_versions: strings(o.mcp_protocol_versions),
  };
}

/**
 * Whether the CLI's `mcp` answers `initialize` itself: it lists the
 * `mcp_lifecycle` feature, or a protocol revision besides the stateless
 * 2026-07-28 one (every revision before it opens with `initialize`).
 */
export function speaksStandardMcp(info: CliVersionInfo | null): boolean {
  if (!info) return false;
  if (info.features.includes('mcp_lifecycle')) return true;
  return info.mcp_protocol_versions.some((v) => v !== SERVER_PROTOCOL);
}

/** How long `--version --json` may take before the CLI counts as an older one. */
export const PROBE_TIMEOUT_MS = 10_000;

/** Run `<cli> --version --json` once; null when it is not a version object. */
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

/** What the launcher does with stdio. */
export type LaunchMode = 'passthrough' | 'bridge';

/**
 * `GAIADESK_MCP_BRIDGE=off`: passthrough; `=on`: always the bridge; otherwise
 * passthrough for a CLI that speaks the standard lifecycle, the bridge for an
 * older one. `probe` is called only when the environment does not decide.
 */
export function launchMode(bridgeEnv: string | undefined, probe: () => CliVersionInfo | null): LaunchMode {
  const b = (bridgeEnv ?? '').trim().toLowerCase();
  if (b === 'off') return 'passthrough';
  if (b === 'on') return 'bridge';
  return speaksStandardMcp(probe()) ? 'passthrough' : 'bridge';
}
