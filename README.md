# Simple LSP Client

A minimal VS Code extension that starts configured stdio language servers and
stdin/stdout formatters.

## Configuration

Configure `simpleLspClient.servers` as an object keyed by server name:

```json
{
  "simpleLspClient.servers": {
    "ruff": {
      "cmd": ["ruff", "server"],
      "filetypes": ["python"]
    }
  }
}
```

Configure `simpleLspClient.formatters` the same way for stdin/stdout formatters:

```json
{
  "simpleLspClient.formatters": {
    "prettier": {
      "cmd": ["prettier", "--stdin-filepath", "${file}"],
      "filetypes": ["javascript", "typescript"]
    }
  }
}
```

Each server and formatter supports:

- `cmd`: exact command and arguments to run.
- `filetypes`: VS Code language IDs to attach to.
- `env`: optional environment variables for the process.

Servers also support:

- `initializationOptions`: optional JSON value passed in the LSP initialize request.
- `formatting`: optional LSP formatting policy. Defaults to `"onlyWhenNoFormatter"`.

Server formatting policy:

- `true`: allow the LSP server to format.
- `false`: suppress formatting from this LSP server.
- `"onlyWhenNoFormatter"`: suppress formatting from this LSP server when an external formatter is configured for any overlapping filetype.

Formatting suppression is per LSP server. If one configured formatter overlaps a
multi-language LSP server, that LSP server's formatting provider is not
registered.

Global formatter setting:

- `simpleLspClient.formatterTimeoutMs`: formatter timeout in milliseconds. Defaults to `30000`; set to `0` to disable.

The extension does not add transport flags like `--stdio`. Put only the
arguments your server expects in `cmd`.

Server `cmd` entries and `env` values support these variables:

- `${workspaceFolder}`
- `${workspaceFolderBasename}`
- `${cwd}`
- `${userHome}`
- `${pathSeparator}`
- `${execPath}`

Formatter `cmd` entries and `env` values support those variables plus:

- `${file}`
- `${relativeFile}`
- `${filetype}`

Formatters always receive document text on stdin and must write formatted text
to stdout. Unlike LSP clients, formatters are registered by language ID without
restricting the document URI scheme.

Server and formatter processes also receive matching `SIMPLE_LSP_CLIENT_*`
environment variables for the workspace, cwd, user home, path separator, and VS
Code executable path. Workspace environment values are empty when no workspace is
open.

When a workspace is open, server processes use the first workspace folder as
their working directory.

## Examples

```json
{
  "simpleLspClient.servers": {
    "ruff": {
      "cmd": ["ruff", "server"],
      "filetypes": ["python"],
      "formatting": "onlyWhenNoFormatter"
    },
    "basedpyright": {
      "cmd": ["basedpyright-langserver", "--stdio"],
      "filetypes": ["python"]
    },
    "clangd": {
      "cmd": ["clangd"],
      "filetypes": ["c", "cpp", "objective-c", "objective-cpp"]
    }
  },
  "simpleLspClient.formatters": {
    "prettier": {
      "cmd": ["prettier", "--stdin-filepath", "${file}"],
      "filetypes": ["javascript", "typescript", "json", "markdown"]
    },
    "clang-format": {
      "cmd": ["clang-format", "--assume-filename", "${file}"],
      "filetypes": ["c", "cpp", "objective-c", "objective-cpp"]
    }
  }
}
```

Example with environment and initialization options:

```json
{
  "simpleLspClient.servers": {
    "custom": {
      "cmd": ["custom-language-server"],
      "filetypes": ["custom"],
      "env": {
        "CUSTOM_SDK": "/opt/custom-sdk"
      },
      "initializationOptions": {
        "indexWorkspace": true
      }
    }
  }
}
```

## Commands

- `Simple LSP Client: Restart Servers`
- `Simple LSP Client: Show Status`
- `Simple LSP Client: List Configured Servers`
- `Simple LSP Client: List Configured Formatters`
- `Simple LSP Client: List Variables`

## Behavior

- Servers start when a matching document is already open or later opened.
- Servers stay running after matching documents close.
- The first workspace folder is used as the server process working directory.
- `cmd` entries and `env` values expand the documented placeholders.
- Formatters are killed if they exceed `simpleLspClient.formatterTimeoutMs`.
- Only stdio language servers are supported.

## Manual Test Checklist

- Open a Python file with Ruff configured as `["ruff", "server"]`; confirm diagnostics or formatting work.
- Open a Python file with both Ruff and basedpyright configured; confirm both clients appear in `Show Status`.
- Open a C or C++ file with clangd configured; confirm hover, completion, diagnostics, or formatting work.
- Configure only a formatter for `jsonc`; confirm VS Code offers it for `Format Document`.
- Change `simpleLspClient.servers` or `simpleLspClient.formatters`; confirm reload behavior in the output channel.
- Run `Simple LSP Client: List Variables`; confirm workspace variables resolve as expected.

## Build

```sh
make vsix
```

See [examples/settings.json](examples/settings.json) for a multi-server setup.
