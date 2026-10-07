# Changelog

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
