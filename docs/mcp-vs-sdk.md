# MCP or SDK?

Both reach the same desks through the same `gaiadesk-cli`, with the same
credentials and the same desk-side enforcement (scopes, `--cwd`,
`--low-priv`, expiry, audit log). The difference is **who decides what
runs**.

## Give a model the MCP server when the model decides

Use the `gaiadesk-mcp` launcher (`gaiadesk-cli mcp`; see this repository's
[README](../README.md)) when an AI assistant (Claude Desktop, Claude Code,
Cursor, VS Code, Windsurf, your own agent loop) should choose the commands,
copies and jobs itself:

- "Find out why the build is failing on the office PC and fix it."
- "Look at the screen and finish the installer." (screen tools: only MCP has them)
- Exploratory work where the next step depends on the last output.

You control it with the **token**, not with code: mint it with only the
scopes the task needs (`exec,cp`, no `shell`, no `screen`), a short
`--expires`, a `--cwd`, and `--low-priv`; read `gaiadesk-cli audit` after;
revoke it the moment anything looks wrong. The model never sees or chooses
the credential.

## Use the SDK when your code decides

Use an SDK when the steps are known in advance and a program runs them:
[`@gaiadesk/sdk`](https://github.com/Gaia-Desk/gaiadesk-typescript) for
TypeScript / Node.js, or [`gaiadesk`](https://github.com/Gaia-Desk/gaiadesk-python)
for Python (sync and asyncio).

- CI/CD: upload a build, run the tests, collect the artifacts, fail the
  pipeline on a non-zero exit (`exec(..., { check: true })`, Python
  `exec(..., check=True)`).
- Fleet chores: run the same check on every desk in parallel and report.
- Dashboards: `stats`, `jobs`, `devices --probe` on a schedule.
- Token administration: mint per-run tokens and revoke them afterwards.
- Glue around a model: your code calls the model, then the SDK, and you keep
  the policy (allow-lists, approvals) in your own code.

You get typed results (the CLI's JSON), typed errors, exit codes, streaming
output, and (Python) asyncio support.

## Both

A common shape: the SDK prepares the ground (mints a narrow token, uploads
the repo, starts a background job), then hands an MCP server holding that
token to a model for the open-ended part, then revokes the token and reads
the audit log.

```ts
import { GaiaDesk } from '@gaiadesk/sdk';

const owner = new GaiaDesk({ code: process.env.DESK_PASSWORD });
await owner.createToken({ desks: desk, name: 'triage', scopes: ['exec'], expires: '2h', cwd: '/srv/app', lowPriv: true, out: tokenFile });
// ... start your MCP client with GAIADESK_TOKEN_FILE=tokenFile, let the model work ...
await owner.revokeToken(desk, 'triage');
console.table(await owner.audit(desk, { token: 'triage' }));
```

```python
import os
from gaiadesk import GaiaDesk

owner = GaiaDesk(code=os.environ["DESK_PASSWORD"])
owner.create_token(desk, name="triage", scopes=["exec"], expires="2h", cwd="/srv/app", low_priv=True, out=token_file)
# ... start your MCP client with GAIADESK_TOKEN_FILE=token_file, let the model work ...
owner.revoke_token(desk, "triage")
for event in owner.audit(desk, token="triage"):
    print(event["action"], event["detail"], event.get("exit_code"))
```

## Quick comparison

| | MCP server | SDK |
|---|---|---|
| Who picks the action | the model | your code |
| Screen (screenshots, clicks, typing) | yes (`screen` scope) | via the SDK's `mcp()` client only |
| Commands, copies, jobs, forwards | yes | yes |
| Devices, probe, stats, measure | no | yes |
| Token mint / list / revoke, audit | no (owner-only, never to a model) | yes |
| Output | text for a model (+ `structuredContent` for exec) | the CLI's JSON, typed |
| Streaming output | no | yes |
