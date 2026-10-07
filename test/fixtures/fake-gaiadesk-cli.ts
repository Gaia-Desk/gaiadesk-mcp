// A stand-in for `gaiadesk-cli mcp`: for each request line it replies with
// {id, result: {argv, saw: <the request>}}; a notification gets nothing.
// Exits with $FAKE_EXIT (default 0) when stdin ends.
//
// `--version --json` is answered as $FAKE_VERSION says:
//   (unset) the version object, with `mcp_protocol_versions`
//   error   exits 2 with an unknown-flag error on stderr (a CLI too old)
//   text    `gaiadesk-cli 0.10.300` as text (a CLI too old)
// Every `--version` run is appended to $FAKE_LOG (when set), so tests can
// see whether the launcher probed.
//
// Compiled to dist-test/fixtures/fake-gaiadesk-cli.js. The launcher runs
// $GAIADESK_CLI directly, so launcher.test.ts wraps it in a small executable
// shell script that execs `node` on the compiled file.
import { appendFileSync } from 'node:fs';

const argv = process.argv.slice(2);

if (argv[0] === '--version') {
  if (process.env.FAKE_LOG) appendFileSync(process.env.FAKE_LOG, JSON.stringify(argv) + '\n');
  const style = process.env.FAKE_VERSION ?? '';
  if (style === 'error') {
    process.stderr.write("gaiadesk-cli: unknown flag '--json'\n");
    process.exit(2);
  }
  if (style === 'text') {
    process.stdout.write('gaiadesk-cli 0.10.300\n');
  } else {
    process.stdout.write(
      JSON.stringify({
        name: 'gaiadesk-cli',
        version: '0.10.324',
        features: ['json_error_envelope', 'exec_json_stream', 'mcp_lifecycle', 'mcp_underscore_tool_names'],
        mcp_protocol_versions: ['2026-07-28', '2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'],
      }) + '\n',
    );
  }
  process.exit(0);
}

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c: string) => {
  buf += c;
  let i: number;
  while ((i = buf.indexOf('\n')) >= 0) {
    const l = buf.slice(0, i);
    buf = buf.slice(i + 1);
    if (!l.trim()) continue;
    let m: { id?: unknown };
    try { m = JSON.parse(l); } catch { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse' } }) + '\n'); continue; }
    if (m.id === undefined || m.id === null) continue;
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: m.id, result: { argv: process.argv.slice(2), saw: m } }) + '\n');
  }
});
process.stdin.on('end', () => process.exit(Number(process.env.FAKE_EXIT || 0)));
