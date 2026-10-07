# Changelog

## Unreleased

- `@gaiadesk/cli` (the prebuilt `gaiadesk-cli` for macOS, Linux and Windows)
  is an optional dependency, and the launcher tries its binary right after
  `$GAIADESK_CLI`, before `PATH`: `npx -y @gaiadesk/mcp` works with nothing
  else installed. The not-found message says how to install it.
- The launcher runs `gaiadesk-cli --version --json` first and passes stdio
  straight through to `gaiadesk-cli mcp`, which speaks the standard MCP
  lifecycle itself. A CLI with no `mcp_protocol_versions` there is too old:
  the launcher exits 1 and says to update gaiadesk-cli. The check is exported
  as `@gaiadesk/mcp/detect`.
- README and docs: tool names are `gaiadesk_*` (`gaiadesk_exec`,
  `gaiadesk_screenshot`, …).

## 0.1.0 (unreleased)

- First version of `@gaiadesk/mcp`: the `gaiadesk-mcp` launcher.
  - Finds `gaiadesk-cli` via `$GAIADESK_CLI`, `PATH`, then the standard
    install locations on macOS, Windows and Linux; exits 127 with the download
    link when it is missing.
  - Runs `gaiadesk-cli mcp <args>` on stdio, forwarding signals and the exit
    code.
- README: every tool and its arguments, credentials and scoped agent tokens,
  configuration for Claude Desktop, Claude Code, Cursor, VS Code, Windsurf and
  generic stdio clients, and the safety model.
- Written in TypeScript (`src/*.ts`, compiled to `dist/`; the `gaiadesk-mcp`
  bin is `dist/bin.js`); tests in TypeScript on `node:test`. No runtime
  dependencies.
- `docs/mcp-vs-sdk.md`: when to use this server and when to use the
  [TypeScript](https://github.com/Gaia-Desk/gaiadesk-typescript) or
  [Python](https://github.com/Gaia-Desk/gaiadesk-python) SDK.
