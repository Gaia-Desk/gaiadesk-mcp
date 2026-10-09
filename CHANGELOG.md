# Changelog

## 0.1.0 (2026-10-08)

First published version of `@gaiadesk/mcp`: the `gaiadesk-mcp` launcher.

- Finds `gaiadesk-cli` via `$GAIADESK_CLI`, then the binary from
  `@gaiadesk/cli` (the prebuilt `gaiadesk-cli` for macOS, Linux and Windows,
  an optional dependency), then `PATH`, then the standard install locations on
  macOS, Windows and Linux: `npx -y @gaiadesk/mcp` works with nothing else
  installed. When it finds nothing it exits 127 and says how to install it.
- Runs `gaiadesk-cli --version --json` first and passes stdio straight
  through to `gaiadesk-cli mcp <args>`, which speaks the standard MCP
  lifecycle itself, forwarding signals and the exit code. A CLI with no
  `mcp_protocol_versions` there is too old: the launcher exits 1 and says to
  update gaiadesk-cli. The check is exported as `@gaiadesk/mcp/detect`.
- README: every tool and its arguments (tool names are `gaiadesk_*`:
  `gaiadesk_exec`, `gaiadesk_screenshot`, `gaiadesk_job_wait`, …; `env` on
  `gaiadesk_exec` and `gaiadesk_job_run`; `bash` and `zsh` shells;
  `blocked_by_os_policy` in exec errors and jobs), credentials and scoped
  agent tokens, configuration for Claude Desktop, Claude Code, Cursor,
  VS Code, Windsurf and generic stdio clients, and the safety model.
- Written in TypeScript (`src/*.ts`, compiled to `dist/`; the `gaiadesk-mcp`
  bin is `dist/bin.js`); tests in TypeScript on `node:test`. No runtime
  dependencies.
- `docs/mcp-vs-sdk.md`: when to use this server and when to use the
  [TypeScript](https://github.com/Gaia-Desk/gaiadesk-typescript) or
  [Python](https://github.com/Gaia-Desk/gaiadesk-python) SDK.
