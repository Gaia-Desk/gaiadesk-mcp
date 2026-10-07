// Finds the `gaiadesk-cli` binary that ships with the GaiaDesk app.
//
// Order (first hit wins):
//   1. $GAIADESK_CLI — an explicit path. If it is set but not runnable, that
//      is an error: we never silently fall through to a different binary.
//   2. Every directory on $PATH (Windows: honouring $PATHEXT).
//   3. The standard install locations for this OS. These come from GaiaDesk's
//      public docs ("Where gaiadesk-cli is", https://gaiadesk.net/docs/agent-access):
//        macOS:   /Applications/GaiaDesk.app/Contents/MacOS/gaiadesk-cli
//                 (and /usr/local/bin/gaiadesk-cli once "Add the gaiadesk
//                 command" was pressed in the app)
//        Windows: gaiadesk-cli.exe in GaiaDesk's install folder
//                 (per-machine: %ProgramFiles%\GaiaDesk)
//        Linux:   /usr/bin/gaiadesk-cli (.deb / .rpm)
//
// Everything here is pure over its inputs (platform, env, home dir and an
// `isRunnable` probe), so the tests run the Windows rules on a Mac and vice
// versa.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const DOWNLOAD_URL = 'https://gaiadesk.net/download';
export const CLI_ENV = 'GAIADESK_CLI';

/** An environment: `process.env`, or a plain object in tests. */
export type Env = Record<string, string | undefined>;

/** The bare executable names to look for on PATH. */
export function binaryNames(platform: string, env: Env = {}): string[] {
  if (platform !== 'win32') return ['gaiadesk-cli'];
  const exts = (env.PATHEXT || '.EXE;.CMD;.BAT;.COM')
    .split(';')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  // .exe first: that is what the installer ships.
  const ordered = ['.exe', ...exts.filter((e) => e !== '.exe')];
  return ordered.map((e) => `gaiadesk-cli${e}`);
}

function pathFor(platform: string): path.PlatformPath {
  return platform === 'win32' ? path.win32 : path.posix;
}

/** Directories on PATH, in order. */
export function pathDirs(platform: string, env: Env = {}): string[] {
  const raw = platform === 'win32' ? env.Path ?? env.PATH ?? env.path : env.PATH;
  if (!raw) return [];
  const sep = platform === 'win32' ? ';' : ':';
  return raw
    .split(sep)
    .map((d) => d.trim().replace(/^"(.*)"$/, '$1'))
    .filter(Boolean);
}

/** The standard install locations for `platform`, most likely first. */
export function standardLocations(platform: string, env: Env = {}, home = ''): string[] {
  const p = pathFor(platform);
  if (platform === 'darwin') {
    const list = ['/Applications/GaiaDesk.app/Contents/MacOS/gaiadesk-cli'];
    if (home) list.push(p.join(home, 'Applications/GaiaDesk.app/Contents/MacOS/gaiadesk-cli'));
    list.push('/usr/local/bin/gaiadesk-cli');
    return list;
  }
  if (platform === 'win32') {
    const list: string[] = [];
    const roots = [env.ProgramFiles, env.ProgramW6432, env['ProgramFiles(x86)']].filter((r): r is string => !!r);
    for (const r of [...new Set(roots)]) list.push(p.join(r, 'GaiaDesk', 'gaiadesk-cli.exe'));
    if (env.LOCALAPPDATA) {
      list.push(p.join(env.LOCALAPPDATA, 'GaiaDesk', 'gaiadesk-cli.exe'));
      list.push(p.join(env.LOCALAPPDATA, 'Programs', 'GaiaDesk', 'gaiadesk-cli.exe'));
    }
    if (list.length === 0) list.push('C:\\Program Files\\GaiaDesk\\gaiadesk-cli.exe');
    return list;
  }
  // Linux and the other Unixes.
  const list = ['/usr/bin/gaiadesk-cli', '/usr/local/bin/gaiadesk-cli'];
  if (home) list.push(p.join(home, '.local/bin/gaiadesk-cli'));
  return list;
}

/** Every candidate path, in the order they are tried (after $GAIADESK_CLI). */
export function candidates(platform: string, env: Env = {}, home = ''): string[] {
  const p = pathFor(platform);
  const out: string[] = [];
  for (const dir of pathDirs(platform, env)) {
    for (const name of binaryNames(platform, env)) out.push(p.join(dir, name));
  }
  out.push(...standardLocations(platform, env, home));
  return [...new Set(out)];
}

/** A file this process can execute (on Windows: a file that exists). */
export function defaultIsRunnable(file: string, platform: string = process.platform): boolean {
  try {
    const st = fs.statSync(file);
    if (!st.isFile()) return false;
    if (platform === 'win32') return true;
    fs.accessSync(file, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export class CliNotFoundError extends Error {
  /** Every path that was tried, in order. */
  readonly tried: string[];

  constructor(message: string, tried: string[]) {
    super(message);
    this.name = 'CliNotFoundError';
    this.tried = tried;
  }
}

/**
 * Locate `gaiadesk-cli`. Returns its absolute path, or throws
 * CliNotFoundError whose message says what was tried and where to get it.
 */
export interface LocateOptions {
  platform?: string;
  env?: Env;
  home?: string;
  /** Can this path be run? Default: an executable regular file (Windows: a file). */
  isRunnable?: (file: string) => boolean;
}

export function locate({
  platform = process.platform,
  env = process.env,
  home = os.homedir(),
  isRunnable = (f: string) => defaultIsRunnable(f, platform),
}: LocateOptions = {}): string {
  const explicit = env[CLI_ENV];
  if (explicit) {
    if (isRunnable(explicit)) return explicit;
    throw new CliNotFoundError(
      `$${CLI_ENV} is set to ${JSON.stringify(explicit)}, but that is not a runnable file. ` +
        `Fix or unset it. Get GaiaDesk (which includes gaiadesk-cli) at ${DOWNLOAD_URL}`,
      [explicit],
    );
  }
  const tried = candidates(platform, env, home);
  for (const c of tried) {
    if (isRunnable(c)) return c;
  }
  throw new CliNotFoundError(notFoundMessage(platform, tried), tried);
}

export function notFoundMessage(platform: string, tried: readonly string[]): string {
  const where = standardLocations(platform, {}, '~')[0];
  return [
    'gaiadesk-cli was not found.',
    '',
    `It ships with the GaiaDesk app. Install GaiaDesk from ${DOWNLOAD_URL}`,
    `(typical location on this OS: ${where}),`,
    `or set ${CLI_ENV} to the full path of gaiadesk-cli.`,
    '',
    `Looked in ${tried.length} places, including:`,
    ...tried.slice(0, 8).map((t) => `  ${t}`),
  ].join('\n');
}
