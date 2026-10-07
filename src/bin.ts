#!/usr/bin/env node
// gaiadesk-mcp: find `gaiadesk-cli` and run `gaiadesk-cli mcp <your args>` on
// this process's stdio. See README.md.
//
//   gaiadesk-mcp [gaiadesk-cli mcp flags...]   serve MCP over stdio
//   gaiadesk-mcp --which                       print the gaiadesk-cli it would run
//
// Environment:
//   GAIADESK_CLI   full path to gaiadesk-cli (skips the search)

import { spawn } from 'node:child_process';

import { locate, CliNotFoundError } from './locate.js';
import { probeCli, updateMessage } from './detect.js';

const args = process.argv.slice(2);

let cli: string;
try {
  cli = locate();
} catch (e) {
  if (e instanceof CliNotFoundError) {
    process.stderr.write(`gaiadesk-mcp: ${e.message}\n`);
    process.exit(127);
  }
  throw e;
}

if (args[0] === '--which') {
  process.stdout.write(`${cli}\n`);
  process.exit(0);
}

if (!probeCli(cli)) {
  process.stderr.write(`gaiadesk-mcp: ${updateMessage(cli)}\n`);
  process.exit(1);
}

const SIGNALS: Record<string, number> = { SIGHUP: 1, SIGINT: 2, SIGKILL: 9, SIGTERM: 15 };

const child = spawn(cli, ['mcp', ...args], { stdio: 'inherit' });
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
  process.on(sig, () => {
    try {
      child.kill(sig);
    } catch {
      /* already gone */
    }
  });
}
child.on('error', (e) => {
  process.stderr.write(`gaiadesk-mcp: could not start ${cli}: ${e.message}\n`);
  process.exit(127);
});
child.on('close', (code, signal) => {
  process.exitCode = signal ? 128 + (SIGNALS[signal] ?? 1) : code ?? 1;
});
