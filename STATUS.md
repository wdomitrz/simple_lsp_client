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
- [x] Add command to list active clients and status.
- [x] Set server process `cwd` and client workspace folder to the first workspace root.
- [x] Add marketplace/publishing metadata beyond local packaging.
- [x] Replace startup activation with generic language and command activation.
- [x] Run final verification after status/workspace/metadata changes.
- [x] Add optional per-server `env`.
- [x] Add optional per-server `initializationOptions`.
- [x] Simplify README and include verified examples.
- [x] Run final verification after env/options/docs changes.
- [x] Serialize restart operations.
- [x] Make server start failures isolated per server.
- [x] Add simple language-aware lazy start without stop-on-close tracking.
- [x] Add minimal runtime config safety for `cmd` and `filetypes`.
- [x] Make `initializationOptions` accept any JSON value.
- [x] Document `env` overlay behavior.
- [x] Make status output easier to read.
- [x] Remove `private: true` for upcoming public availability.
- [x] Run final verification after review fixes.
- [x] Add README known limitations.
- [x] Add example settings file.
- [x] Start servers only when a matching document is open.
- [x] Start newly relevant servers on document open.
- [x] Keep servers running after matching documents close.
- [x] Add `simpleLspClient.formatters` configuration.
- [x] Register external stdin/stdout document formatters by filetype.
- [x] Support formatter `${file}` and `${filetype}` command placeholders.
- [x] Run final verification after formatter support.
- [x] Bump package version and rebuild VSIX.
- [x] Split implementation into focused ES modules.
- [x] Fix status output so configured formatters are shown even without active LSP clients.
- [x] Register formatters by language without restricting document URI scheme.
- [x] Add commands to list configured servers and configured formatters.

## Notes

- `simpleLspClient.servers` is an object keyed by server name.
- Each server supports `cmd`, `filetypes`, optional `env`, and optional `initializationOptions`.
- Each formatter supports `cmd`, `filetypes`, and optional `env`.
- All servers are assumed to use stdio.
- Runtime config validation is intentionally minimal and only checks non-empty `cmd` and `filetypes` arrays.
- The generated VSIX excludes repo-only status and build metadata.
- Current testable VSIX: `simple-lsp-client-0.1.3.vsix`.
- Fixed executable server startup so no `--stdio` flag is injected by `vscode-languageclient`.
- Server status can be shown with `Simple LSP Client: Show Status`.
- Configured servers and formatters can be listed separately from the command palette.
- Server processes use the first VS Code workspace folder as `cwd` when available.
- Activation now uses generic `onLanguage` instead of `onStartupFinished`.
- Explicit command activation events were removed; modern VS Code activates contributed commands automatically.
- Server config now supports optional `env` and `initializationOptions`.
- Restart operations are serialized to avoid duplicate clients.
- Server startup failures are isolated and do not block other configured servers.
- Servers start lazily for matching open documents and are not stopped on close.
- Formatters always read document text from stdin and write formatted text to stdout.
- Formatter providers are registered for matching language IDs across URI schemes; LSP clients remain limited to `file` and `untitled`.
- Source is split into focused modules for configuration, document helpers, LSP clients, formatters, output, status, and shared types.

## Manual Verification

- Ruff starts with `ruff server`; formatting and diagnostics work.
- basedpyright starts with `basedpyright-langserver --stdio` and works alongside Ruff for Python.
- clangd starts with `clangd`; diagnostics, hover/navigation, completion, rename, and formatting work on C++.
