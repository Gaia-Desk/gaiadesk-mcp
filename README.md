# GaiaDesk MCP server

Let an AI assistant (Claude Desktop, Claude Code, Cursor, VS Code, Windsurf,
or any MCP client) work on your GaiaDesk machines ("desks"): run commands
and get their exit codes back, copy files, start and watch background jobs,
forward ports, and, if you allow it, see and drive the screen.

The MCP server is part of GaiaDesk itself: it is `gaiadesk-cli mcp`, and it
ships with the GaiaDesk app. This repository holds:

- this guide: every tool, sign-in and scoped tokens, client configs, safety;
- `@gaiadesk/mcp`, a small npm launcher (`gaiadesk-mcp`, written in
  TypeScript, no runtime dependencies) that finds `gaiadesk-cli` on your
  machine and runs `gaiadesk-cli mcp` on stdio (bridging an older CLI to
  clients that open with `initialize`), so a client config can say
  `npx -y @gaiadesk/mcp` instead of a per-OS path;
- [MCP or SDK?](docs/mcp-vs-sdk.md): when to give a model this server and
  when to drive desks from your own code with an SDK.

Writing a program rather than configuring an assistant? Use an SDK:
[TypeScript](https://github.com/Gaia-Desk/gaiadesk-typescript) (`@gaiadesk/sdk`)
or [Python](https://github.com/Gaia-Desk/gaiadesk-python) (`gaiadesk`). Both
can also start this MCP server for the screen tools.

GaiaDesk is closed-source. This repository contains no GaiaDesk code; it only
starts the `gaiadesk-cli` you installed. MIT-licensed.

---

## Contents

- [Install](#install)
- [Credentials](#credentials)
- [Client configuration](#client-configuration)
- [The tools](#the-tools)
- [Safety](#safety)
- [Protocol version and the launcher's bridge](#protocol-version-and-the-launchers-bridge)
- [Troubleshooting](#troubleshooting)
- [MCP or SDK?](docs/mcp-vs-sdk.md)
- [Development](#development)

---

## Install

1. **Install GaiaDesk** on the machine where your MCP client runs:
   <https://gaiadesk.net/download>. `gaiadesk-cli` is installed with it:

   | OS | Where `gaiadesk-cli` is |
   |---|---|
   | macOS | `/Applications/GaiaDesk.app/Contents/MacOS/gaiadesk-cli` (and `/usr/local/bin/gaiadesk-cli` after **Settings → Terminal over the Mesh → Add the gaiadesk command**) |
   | Windows | `gaiadesk-cli.exe` in GaiaDesk's install folder (usually `C:\Program Files\GaiaDesk\`); the installer adds it to `PATH` |
   | Linux (.deb, .rpm) | `/usr/bin/gaiadesk-cli` |
   | Linux (AppImage) | not on `PATH`; install the .deb/.rpm instead, or extract the AppImage (see GaiaDesk's docs) |

2. **Install GaiaDesk on each desk** you want the assistant to reach, and
   turn on **Settings → Agent access** there.

3. **Use the launcher** (optional). With Node.js 18 or newer:

   ```sh
   npx -y @gaiadesk/mcp --which      # prints the gaiadesk-cli it found
   ```

   The launcher looks, in order, at `$GAIADESK_CLI` (an explicit path; if it
   is set but wrong, that is an error, never a silent fallback), every
   directory on `PATH`, then the standard locations above. If it finds
   nothing it exits 127 and says where to download GaiaDesk.

   You can skip the launcher and point your client straight at the absolute
   path of `gaiadesk-cli` with `args: ["mcp"]`. MCP clients do not search your
   shell's `PATH`, so use the full path.

## Credentials

**Never give an assistant the desk's password or access code.** Give it a
**scoped, expiring agent token**. It can only do what you allowed, only on
the desks you named, optionally only inside one folder, stops working on its
own, is revoked with one command, and everything it does is recorded.

### Mint a token (the desk's owner)

On your own machine, as the desk's owner (the desk's **unattended password**
is asked for once; a one-time access code is not enough):

```sh
gaiadesk-cli token create --desk 123456789 --name claude \
  --scope exec,cp,jobs --expires 3d \
  --cwd /Users/me/projects/site --low-priv \
  --out ~/.config/gaiadesk/claude.token
```

| Flag | Meaning |
|---|---|
| `--desk <id>[,<id>…]` | One token per desk, all written to the one `--out` file. A token names its desk and is never sent to another. |
| `--name <n>` | What it is for. Used by `list`, `revoke` and `audit`. |
| `--expires <d>` | `30m`, `24h`, `7d`, `2w`. Default `7d`. The desk's owner sets the maximum (30 days unless changed). |
| `--scope <list>` | Default `exec,cp,jobs`. See the table below. |
| `--cwd <dir on the desk>` | Commands, shells and jobs start there; every copied path must resolve inside it. Not a sandbox: that is what `--low-priv` is for. |
| `--low-priv` | Its work runs as the desk's low-privilege **agent user** (set on the desk), or is refused. Never as you. |
| `--out <file>` | Written with mode 0600. Without it the token is printed once. |

| Scope | Allows (CLI, and the MCP tools) |
|---|---|
| `exec` | one command: `gaiadesk_exec` |
| `shell` | an interactive `gaiadesk-cli shell` (no MCP tool) |
| `cp` | `gaiadesk_copy_files` |
| `forward` | `gaiadesk_forward_start` |
| `jobs` | `gaiadesk_job_run`, `job_list`, `job_logs`, `job_kill` |
| `screen` | the screen tools (`gaiadesk_open_session`, `screenshot`, `click`, …) |

You can also issue tokens in the GaiaDesk app: **Agents → Agent tokens**
(screen tokens: **Agents → Connect an AI assistant**).

### List, audit, revoke

```sh
gaiadesk-cli token list   --desk 123456789
gaiadesk-cli audit        --desk 123456789 --token claude      # what it ran, with exit codes
gaiadesk-cli token revoke --desk 123456789 claude              # by name or id; at once
gaiadesk-cli token revoke --desk 123456789 --all-for-desk
gaiadesk-cli token revoke --desk 123456789 claude --account    # through your signed-in account, no password
```

A revoke takes effect immediately: the token's sessions are disconnected and
its background jobs stopped. `--account` needs this machine signed in
(`gaiadesk-cli login`).

### What the MCP server presents

The credential always comes from the server's **environment**, never from a
tool argument, so a model cannot be talked into using a different one.

| Environment variable | Used for |
|---|---|
| `GAIADESK_TOKEN_FILE` | **Desk tools** (`exec`, `copy_files`, `job_*`, `forward_*`): path to a token file from `token create --out`. Must not be readable by other users (`chmod 600`). |
| `GAIADESK_CODE` | Desk tools, if no token file: the desk's code or password. Avoid for assistants. |
| `GAIADESK_AGENT_TOKEN` | **Screen tools** (and the desk tools' fallback): an agent token with the `screen` scope. |
| `GAIADESK_PERSIST` | How long a desk connection is held between calls (`10m` default, `0` = fresh every call). |

Over stdio the desk tools use `GAIADESK_TOKEN_FILE`, then `GAIADESK_CODE`,
then `GAIADESK_AGENT_TOKEN`. With none of them set, the server lists no tools
and refuses every call (it says why on stderr). The tool list depends on
what you set: only desk tools with a token file, desk and screen tools with
a screen agent token.

Reaching a desk: on the same LAN or GaiaDesk Mesh nothing more is needed;
elsewhere the desk is reached through the GaiaDesk server, and with an agent
token that needs no account sign-in.

## Client configuration

All examples use the launcher. To skip it, replace `"command": "npx"` and
`"args": ["-y", "@gaiadesk/mcp", …]` with the absolute path of `gaiadesk-cli`
and `"args": ["mcp", …]`.

**Always pass `--audit-dir`.** Screen sessions record what they did (an
`audit.jsonl` and the screenshots the model saw) into the server's working
directory by default, and some clients (Claude Desktop) start servers in a
directory they cannot write to; a screen session whose record cannot be
written is closed before it acts. There is no flag to turn the record off.

### Claude Desktop

**Settings → Developer → Edit Config** (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "gaiadesk": {
      "command": "npx",
      "args": ["-y", "@gaiadesk/mcp", "--audit-dir", "/Users/me/gaiadesk-agent-sessions"],
      "env": { "GAIADESK_TOKEN_FILE": "/Users/me/.config/gaiadesk/claude.token" }
    }
  }
}
```

Quit Claude Desktop completely and reopen it. (For screen tools, the GaiaDesk
app's **Agents → Connect an AI assistant** card can write this file for you
with the real paths.)

### Claude Code

```sh
claude mcp add gaiadesk \
  -e GAIADESK_TOKEN_FILE="$HOME/.config/gaiadesk/claude.token" \
  -- npx -y @gaiadesk/mcp --audit-dir "$HOME/gaiadesk-agent-sessions"
```

Add `--scope user` to use it in every project, or `--scope project` to write
`.mcp.json` for your team (do not commit token files).

### Cursor

`~/.cursor/mcp.json` (all projects) or `.cursor/mcp.json` (one project):

```json
{
  "mcpServers": {
    "gaiadesk": {
      "command": "npx",
      "args": ["-y", "@gaiadesk/mcp", "--audit-dir", "/Users/me/gaiadesk-agent-sessions"],
      "env": { "GAIADESK_TOKEN_FILE": "/Users/me/.config/gaiadesk/claude.token" }
    }
  }
}
```

### VS Code

`.vscode/mcp.json` in the workspace (or **MCP: Open User Configuration**):

```json
{
  "servers": {
    "gaiadesk": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@gaiadesk/mcp", "--audit-dir", "${userHome}/gaiadesk-agent-sessions"],
      "env": { "GAIADESK_TOKEN_FILE": "${userHome}/.config/gaiadesk/claude.token" }
    }
  }
}
```

### Windsurf

`~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "gaiadesk": {
      "command": "npx",
      "args": ["-y", "@gaiadesk/mcp", "--audit-dir", "/Users/me/gaiadesk-agent-sessions"],
      "env": { "GAIADESK_TOKEN_FILE": "/Users/me/.config/gaiadesk/claude.token" }
    }
  }
}
```

### Any stdio client

Command `npx -y @gaiadesk/mcp [flags]` (or `gaiadesk-cli mcp [flags]`),
credentials in the environment, newline-delimited JSON-RPC on stdin/stdout,
logs on stderr. On Windows, `npx` is `npx.cmd`; some clients need
`"command": "cmd", "args": ["/c", "npx", "-y", "@gaiadesk/mcp", …]`.

### Streamable HTTP (screen tools only)

`gaiadesk-cli mcp --http` serves on `http://127.0.0.1:7333/mcp` and needs
`GAIADESK_AGENT_TOKEN`; clients must send `Authorization: Bearer <token>` on
every request. Over HTTP the desk tools use only that agent token, and
`gaiadesk_exec` is not offered.

```sh
GAIADESK_AGENT_TOKEN=gdagt_… gaiadesk-cli mcp --http --audit-dir ~/gaiadesk-agent-sessions
```

### Server flags (`gaiadesk-cli mcp --help`)

| Flag | Meaning |
|---|---|
| `--stdio` | The default. |
| `--http` | Streamable HTTP instead of stdio. |
| `--bind <ip>` | HTTP listen address, default `127.0.0.1` (implies `--http`). Off loopback it warns; the token is still required. |
| `--port <n>` | HTTP port, default `7333` (implies `--http`). |
| `--allow-origin <o>` | Accept this `Origin` (repeatable, implies `--http`). |
| `--server <wss://host/ws>` | Signaling server to fall back to (default `wss://gaiadesk.net/ws`). |
| `--allow-domain <d>` | Domain allowlist for every screen session (repeatable). |
| `--audit-dir <dir>` | Where screen sessions are recorded (default: the working directory). |

The launcher passes every flag through unchanged. Its own options:
`gaiadesk-mcp --which` prints the `gaiadesk-cli` it would run;
`GAIADESK_CLI=<path>` picks the binary; `GAIADESK_MCP_BRIDGE=off` / `on`
turns the bridge for older CLIs described
[below](#protocol-version-and-the-launchers-bridge) off or always on.

## The tools

Names, arguments and limits are those `gaiadesk-cli mcp` advertises in
`tools/list` (0.10.324 and newer; an older CLI spells every name with a dot,
`gaiadesk.exec`: see [Tool names on older CLIs](#tool-names-on-older-clis)). Every schema has `additionalProperties: false`: an invented
argument is an error, not silently ignored.

### Desk tools (no screen involved)

| Tool | Arguments | Needs scope | Returns |
|---|---|---|---|
| `gaiadesk_exec` | `desk_id` (required); `command` (one command line for the shell) **or** `argv` (exact argument vector); `shell`: `default` \| `none` \| `sh` \| `cmd` \| `pwsh`; `timeout_seconds` (default 1800, `0` = no limit); `stdin` (text, then end of input) | `exec` | Text: `exit N`, then `--- stdout ---` / `--- stderr ---`. `structuredContent`: the same object as `gaiadesk-cli exec --json` (`exit`, `remote_code`, `stdout`, `stderr`, `duration_ms`, `desk`, `route`, `mode`, `shell`, `timed_out`, `error`, `notes`, `truncated`). `isError` when the exit is not 0. |
| `gaiadesk_copy_files` | `desk_id`, `direction` (`upload` \| `download`), `local` (path on this machine), `remote` (path on the desk; relative = under the desk user's home; trailing `/` = into that folder), `recursive` (default false) | `cp` | JSON text: `direction`, `desk`, `destination`, `files`, `dirs`, `bytes`, `resumed_bytes`, `failed[]`, `seconds`. Resumable. |
| `gaiadesk_job_run` | `desk_id`, `name` (letters, digits, `. _ -`), `command` (shell command line); optional `priority` (`low` \| `normal` \| `high`), `cpu_percent` (1-100 of the whole machine), `mem_mb`, `keep_awake` | `jobs` | JSON text `{"job": {...}}` |
| `gaiadesk_job_list` | `desk_id` | `jobs` | JSON text `{"jobs": [...]}` (name, state `running`/`exited`/`killed`/`lost`, exit code, command, …) |
| `gaiadesk_job_logs` | `desk_id`, `name`, `tail_bytes` (1-65536, default 65536) | `jobs` | JSON text `{"job": {...}, "output": "..."}` (stdout and stderr together) |
| `gaiadesk_job_kill` | `desk_id`, `name` | `jobs` | JSON text `{"job": {...}}`; stops the job and everything it started |
| `gaiadesk_forward_start` | `desk_id`, `remote_port` (1-65535); optional `remote_host` (default the desk itself, `127.0.0.1`), `local_port` (0 or absent = pick a free one) | `forward` | JSON text `{"forward_id", "local_port", "note"}`; listens on localhost of the machine running the server |
| `gaiadesk_forward_stop` | `forward_id` | - | JSON text `{"stopped", "local_port"}` |

`gaiadesk_exec` runs **one** command, like `ssh host cmd`: no terminal, no
prompt, no echo, stdin closed unless you pass `stdin`. The default shell is
the desk's own (the user's login shell on macOS/Linux, `cmd.exe` on Windows);
use `shell: "sh"` for portable POSIX scripts and `shell: "pwsh"` for
PowerShell. Long work belongs in `gaiadesk_job_run`, not in a backgrounded
`exec` (exec ends its whole process tree when it returns).

The desk tools keep the connection to each desk open between calls (per desk
and credential), so the tenth call costs no handshake.

### Screen tools (Agent Access)

Need `GAIADESK_AGENT_TOKEN` holding a token with the `screen` scope, and
**Agent access** turned on at the desk.

| Tool | Arguments |
|---|---|
| `gaiadesk_open_session` | `desk_id`. Returns `structuredContent: {session_id, desk_id}`. Every other screen tool takes `session_id`. A session closes after 15 minutes without a call; at most 8 per server. |
| `gaiadesk_close_session` | `session_id`. Releases anything held down. |
| `gaiadesk_screenshot` | `session_id`; optional `region` `[left, top, right, bottom]` (a magnified crop for reading detail; never changes the coordinate space). Returns an image. |
| `gaiadesk_click` | `session_id`, `x`, `y`; optional `button` (`left` \| `right` \| `middle`), `count` (1, 2, 3; 2 and 3 left button only), `hold_keys` (e.g. `"ctrl+shift"`) |
| `gaiadesk_move_pointer` | `session_id`, `x`, `y` |
| `gaiadesk_drag` | `session_id`, `from_x`, `from_y`, `to_x`, `to_y`; optional `hold_keys` |
| `gaiadesk_press_button` | `session_id`, `state` (`down` \| `up`): hold or release the left button across calls |
| `gaiadesk_scroll` | `session_id`, `x`, `y`, `direction` (`up` \| `down` \| `left` \| `right`), `clicks` (>= 1); optional `hold_keys` |
| `gaiadesk_type_text` | `session_id`, `text`; optional `secret` (a credential: still typed in full, withheld from watchers and logs; too short to redact safely is refused) |
| `gaiadesk_press_keys` | `session_id`, `keys` (e.g. `"Return"`, `"ctrl+c"`, `"cmd+shift+4"`); optional `repeat` |
| `gaiadesk_hold_keys` | `session_id`, `keys`, `seconds` |
| `gaiadesk_wait` | `session_id`, `seconds` |
| `gaiadesk_pointer_position` | `session_id` |

`x`/`y` are pixels in the most recent full screenshot, origin top-left. Key
names are xdotool-style; an unknown name is refused, never guessed.
`ctrl+c` on a Mac is Control-C, not Command-C; `super` is Command on macOS and
the Windows key on Windows.

## Safety

- **The desk decides.** Every scope, folder (`--cwd`), agent-user
  (`--low-priv`) and expiry check is enforced on the desk, on every request.
  A missing scope comes back as a tool error in the desk's own words.
- **Opt-in per desk.** Agents connect only to desks whose owner turned on
  **Settings → Agent access → Let AI agents connect to this computer**.
  Turning it off refuses the next connect and disconnects running agent
  sessions.
- **The owner indicator.** Screen sessions are announced on the desk with a
  banner and a corner panel (on by default). Command-line work (`exec`, copies,
  jobs) can be announced too: the owner turns on *Show when an AI agent or the
  command line is working on this computer* (**Agents → Limits and
  indicator**). The panel lists what is running and who started it, with
  **Pause agent jobs**, **Stop agent jobs** and **Disconnect agent**.
- **Supervision tiers and approvals** (screen sessions). A desk or token can
  require that an agent acts only while someone watches. When the agent is
  about to do something not undoable (paying, agreeing to terms, sending,
  deleting), the run stops and asks a watching person; nobody watching, no
  answer in two minutes, or a dropped session all mean **refused**.
- **Records.** Every action an agent token takes is kept in the desk's audit
  log for 90 days (`gaiadesk-cli audit`), and in your account when the desk is
  signed in. Screen sessions also write `audit.jsonl` and screenshots under
  `--audit-dir`.
- **Prompt injection.** A model reading a hostile web page or file can be
  told to do things you did not ask for. Keep scopes minimal, use `--cwd` and
  `--low-priv`, short expiries, and `--allow-domain` for screen sessions.

Details: <https://gaiadesk.net/docs/cli-for-agents> and
<https://gaiadesk.net/docs/agent-access>.

## Protocol version and the launcher's bridge

`gaiadesk-cli mcp` **0.10.324 and newer** speaks both:

- the standard MCP lifecycle (`initialize`, then `notifications/initialized`,
  then plain requests) at revisions 2025-11-25, 2025-06-18, 2025-03-26 and
  2024-11-05, which is what most clients send today; and
- the stateless revision **2026-07-28** (no `initialize`; every request carries
  `params._meta["io.modelcontextprotocol/protocolVersion"]` and
  `params._meta["io.modelcontextprotocol/clientCapabilities"]`).

`gaiadesk-cli --version --json` lists the revisions it speaks
(`mcp_protocol_versions`) and the `mcp_lifecycle` feature.

**Older `gaiadesk-cli` (before 0.10.324)** speak only 2026-07-28: a client
that opens with `initialize` gets JSON-RPC error `-32602` from them directly.

The launcher handles both. Before it starts the server it runs
`gaiadesk-cli --version --json`:

- **A CLI that speaks the standard lifecycle** (the output is a version
  object listing `mcp_lifecycle`, or a protocol revision besides 2026-07-28):
  stdio is passed straight through, every byte, both ways. No bridge.
- **An older CLI** (it prints its version as text, or fails on `--json`): the
  launcher bridges. If the **first** message from the client is
  `initialize`, it answers `initialize` and `ping` itself, drops client
  notifications, and adds the two `_meta` fields to every other request.
  Otherwise it passes every byte through untouched. Server output is never
  modified.

`GAIADESK_MCP_BRIDGE=off` skips the check and never bridges (pure stdio
passthrough); `GAIADESK_MCP_BRIDGE=on` skips the check and always bridges.

### Tool names on older CLIs

The tool names above (`gaiadesk_exec`, `gaiadesk_screenshot`, …) are those of
`gaiadesk-cli` 0.10.324 and newer; they match `[A-Za-z0-9_-]`, which every
model provider accepts. Those CLIs still accept the old dotted spelling
(`gaiadesk.exec`) in `tools/call`. An **older** CLI advertises and accepts only
the dotted names (`gaiadesk.exec`, `gaiadesk.copy_files`,
`gaiadesk.job_run`, …, `gaiadesk.open_session`, `gaiadesk.screenshot`, …).
The bridge does not rename tools, so with an older CLI your client sees the
dotted names, and a client whose model provider restricts function names to
`[A-Za-z0-9_-]` may reject them: update GaiaDesk on the machine running the
server.

## Troubleshooting

| Symptom | Cause |
|---|---|
| `gaiadesk-cli was not found` (exit 127) | Install GaiaDesk (<https://gaiadesk.net/download>) or set `GAIADESK_CLI`. |
| No tools listed; stderr says `no agent token in $GAIADESK_AGENT_TOKEN` | No credential in the server's environment. Set `GAIADESK_TOKEN_FILE` (desk tools) or `GAIADESK_AGENT_TOKEN` (screen tools). The stderr line appears whenever `GAIADESK_AGENT_TOKEN` is unset, even if desk tools work. |
| A tool returns "…the `cp` scope…" | The token lacks that scope. Mint one with it. |
| `-32602 … _meta … is required` | A client that opens with `initialize`, talking directly to a `gaiadesk-cli mcp` from before 0.10.324. Update GaiaDesk, or use the launcher. |
| A call to `gaiadesk_exec` (or any `gaiadesk_*` tool) is refused as an unknown tool | An older `gaiadesk-cli` (before 0.10.324) whose tools are dotted (`gaiadesk.exec`). Update GaiaDesk. |
| Screen session closes at once | `--audit-dir` is missing or not writable. |
| Token file refused | Other users can read it: `chmod 600`. |

## Development

The launcher is TypeScript in [`src/`](src) (`locate.ts`: finding
`gaiadesk-cli`; `detect.ts`: reading `gaiadesk-cli --version --json` to
decide between passthrough and the bridge; `bridge.ts`: the legacy-handshake
bridge for older CLIs, pure; `bin.ts`: the stream wiring), compiled to `dist/`, which is what npm publishes.

```sh
npm ci
npm test       # build src/ to dist/, build test/ to dist-test/, run node:test against dist/
```

The end-to-end tests run the built `dist/bin.js` against a fake
`gaiadesk-cli` ([`test/fixtures/fake-gaiadesk-cli.ts`](test/fixtures/fake-gaiadesk-cli.ts)),
as a new CLI (`--version --json` answered) and as an older one (text, or an
error);
they need a POSIX shell and are skipped on Windows, where the locator and
bridge tests still run. CI runs on Linux, macOS and Windows with Node 18,
20 and 22. The only dev dependencies are `typescript` and `@types/node`.

## License

MIT. See [LICENSE](LICENSE). GaiaDesk itself is proprietary software and is
not covered by this license.
