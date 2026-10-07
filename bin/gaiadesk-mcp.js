#!/usr/bin/env node
// gaiadesk-mcp: find `gaiadesk-cli` and run `gaiadesk-cli mcp <your args>` on
// this process's stdio. See README.md.
//
//   gaiadesk-mcp [gaiadesk-cli mcp flags...]   serve MCP over stdio
//   gaiadesk-mcp --which                       print the gaiadesk-cli it would run
//
// Environment:
//   GAIADESK_CLI          full path to gaiadesk-cli (skips the search)
//   GAIADESK_MCP_BRIDGE   "off": pure passthrough, no legacy-handshake bridge

import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { locate, CliNotFoundError } from '../src/locate.js';
import { createBridge, splitLines } from '../src/bridge.js';

const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'));
const args = process.argv.slice(2);

let cli;
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

const childArgs = ['mcp', ...args];
const bridgeOff = (process.env.GAIADESK_MCP_BRIDGE || '').toLowerCase() === 'off';

function forwardSignals(child) {
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.on(sig, () => {
      try {
        child.kill(sig);
      } catch {
        /* already gone */
      }
    });
  }
}

function onExit(child) {
  child.on('error', (e) => {
    process.stderr.write(`gaiadesk-mcp: could not start ${cli}: ${e.message}\n`);
    process.exit(127);
  });
  // 'close': the process has exited AND its stdout has been drained, so every
  // reply it wrote has been forwarded. Exit by letting the event loop empty
  // (process.exit could drop output still queued on a pipe).
  child.on('close', (code, signal) => {
    process.exitCode = signal ? 128 + (SIGNALS[signal] ?? 1) : code ?? 1;
    process.stdin.destroy();
  });
}

const SIGNALS = { SIGHUP: 1, SIGINT: 2, SIGKILL: 9, SIGTERM: 15 };

if (bridgeOff) {
  const child = spawn(cli, childArgs, { stdio: 'inherit' });
  forwardSignals(child);
  onExit(child);
} else {
  const child = spawn(cli, childArgs, { stdio: ['pipe', 'pipe', 'inherit'] });
  forwardSignals(child);
  onExit(child);
  const bridge = createBridge({ name: 'gaiadesk', version: pkg.version });

  let inBuf = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    let lines;
    [lines, inBuf] = splitLines(inBuf + chunk);
    for (const line of lines) {
      const { toServer, toClient } = bridge.fromClient(line);
      for (const l of toServer) child.stdin.write(`${l}\n`);
      for (const l of toClient) process.stdout.write(`${l}\n`);
    }
  });
  process.stdin.on('end', () => {
    if (inBuf.trim()) {
      const { toServer, toClient } = bridge.fromClient(inBuf);
      for (const l of toServer) child.stdin.write(`${l}\n`);
      for (const l of toClient) process.stdout.write(`${l}\n`);
    }
    child.stdin.end();
  });
  child.stdin.on('error', () => {
    /* the server exited; its exit is reported by onExit */
  });

  let outBuf = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    let lines;
    [lines, outBuf] = splitLines(outBuf + chunk);
    for (const line of lines) process.stdout.write(`${bridge.fromServer(line)}\n`);
  });
  child.stdout.on('end', () => {
    if (outBuf) process.stdout.write(bridge.fromServer(outBuf));
  });
}
