# Simple LSP Client

A minimal VS Code extension that starts configured stdio language servers.

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

Each server supports:

- `cmd`: exact command and arguments to run.
- `filetypes`: VS Code language IDs to attach to.
- `env`: optional environment variables for the server process.
- `initializationOptions`: optional JSON value passed in the LSP initialize request.

The extension does not add transport flags like `--stdio`. Put only the
arguments your server expects in `cmd`.

When a workspace is open, server processes use the first workspace folder as
their working directory.

## Examples

```json
{
  "simpleLspClient.servers": {
    "ruff": {
      "cmd": ["ruff", "server"],
      "filetypes": ["python"]
    },
    "basedpyright": {
      "cmd": ["basedpyright-langserver", "--stdio"],
      "filetypes": ["python"]
    },
    "clangd": {
      "cmd": ["clangd"],
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

## Behavior

- Servers start when a matching document is already open or later opened.
- Servers stay running after matching documents close.
- The first workspace folder is used as the server process working directory.
- `env` values are literal strings; no interpolation or unsetting is performed.
- Only stdio language servers are supported.

## Build

```sh
make vsix
```

See [examples/settings.json](examples/settings.json) for a multi-server setup.
