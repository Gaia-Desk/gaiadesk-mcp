# Changelog

## Unreleased

- `@gaiadesk/cli` (the prebuilt `gaiadesk-cli` for macOS, Linux and Windows)
  is an optional dependency, and the launcher tries its binary right after
  `$GAIADESK_CLI`, before `PATH`: `npx -y @gaiadesk/mcp` works with nothing
  else installed. The not-found message says how to install it.
- The launcher runs `gaiadesk-cli --version --json` first. A CLI that speaks
  the standard MCP lifecycle itself (0.10.324 and newer: the `mcp_lifecycle`
  feature, or a protocol revision besides 2026-07-28 in
  `mcp_protocol_versions`) gets its stdio passed straight through, with no
  bridge. An older CLI (its version as text, or an error) is bridged as
  before. `GAIADESK_MCP_BRIDGE=on` forces the bridge; `off` still forces
  passthrough. The check is exported as `@gaiadesk/mcp/detect`.
- README and docs: tool names are `gaiadesk_*` (`gaiadesk_exec`,
  `gaiadesk_screenshot`, …), as `gaiadesk-cli` 0.10.324 advertises them; the
  dotted names of older CLIs are noted.

## 0.1.0 (unreleased)

- First version of `@gaiadesk/mcp`: the `gaiadesk-mcp` launcher.
  - Finds `gaiadesk-cli` via `$GAIADESK_CLI`, `PATH`, then the standard
    install locations on macOS, Windows and Linux; exits 127 with the download
    link when it is missing.
  - Runs `gaiadesk-cli mcp <args>` on stdio, forwarding signals and the exit
    code.
  - Bridges clients that open with the legacy `initialize` handshake to the
    stateless MCP 2026-07-28 revision `gaiadesk-cli mcp` speaks
    (`GAIADESK_MCP_BRIDGE=off` disables it).
- README: every tool and its arguments, credentials and scoped agent tokens,
  configuration for Claude Desktop, Claude Code, Cursor, VS Code, Windsurf and
  generic stdio clients, and the safety model.
- Written in TypeScript (`src/*.ts`, compiled to `dist/`; the `gaiadesk-mcp`
  bin is `dist/bin.js`); tests in TypeScript on `node:test`. No runtime
  dependencies.
- `docs/mcp-vs-sdk.md`: when to use this server and when to use the
  [TypeScript](https://github.com/Gaia-Desk/gaiadesk-typescript) or
  [Python](https://github.com/Gaia-Desk/gaiadesk-python) SDK.
