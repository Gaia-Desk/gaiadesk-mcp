// A stand-in for `gaiadesk-cli mcp`: for each request line it replies with
// {id, result: {argv, saw: <the request>}}; a notification gets nothing.
// Exits with $FAKE_EXIT (default 0) when stdin ends.
//
// Compiled to dist-test/fixtures/fake-gaiadesk-cli.js. The launcher runs
// $GAIADESK_CLI directly, so launcher.test.ts wraps it in a small executable
// shell script that execs `node` on the compiled file.
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
