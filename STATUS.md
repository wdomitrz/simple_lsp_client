# Status

## Plan

- [x] Add VS Code configuration schema for named LSP servers.
- [x] Load typed server configuration from VS Code settings.
- [x] Start one stdio `LanguageClient` per valid named server.
- [x] Support multiple LSP servers for the same VS Code language ID.
- [x] Add lifecycle handling for activation, configuration reload, and deactivation.
- [x] Log startup, invalid config, reload, and shutdown failures to an output channel.
- [x] Run formatter, strict linting, and type checking once.
- [x] Fix strict lint/type issues without weakening checks.
- [x] Run final formatter, strict linting, type checking, and VSIX packaging.
- [x] Add user-facing restart command.
- [x] Add README with configuration and manual test instructions.
- [x] Run final verification after documentation and command polish.

## Notes

- `simpleLspClient.servers` is an object keyed by server name.
- Each server currently supports `cmd` and `filetypes`.
- All servers are assumed to use stdio.
- Runtime config validation was removed by design; the extension assumes settings match the contributed schema.
- The generated VSIX excludes repo-only status and build metadata.
- First testable VSIX: `simple-lsp-client-0.0.1.vsix`.
- Fixed executable server startup so no `--stdio` flag is injected by `vscode-languageclient`.
