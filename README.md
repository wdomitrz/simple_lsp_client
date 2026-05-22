# Simple LSP Client

A small VS Code extension that starts configured stdio language servers.

## Configuration

Configure servers with `simpleLspClient.servers`. The setting is an object keyed
by server name. Each server has:

- `cmd`: exact command plus arguments used to start the server.
- `filetypes`: VS Code language IDs the server should attach to.

The extension communicates with the server process over its standard input and
output streams. It does not add stdio-related command-line flags. Put only the
arguments required by that server in `cmd`.

Example:

```json
{
  "simpleLspClient.servers": {
    "ruff": {
      "cmd": ["ruff", "server"],
      "filetypes": ["python"]
    },
    "ruff-extra": {
      "cmd": ["ruff", "server"],
      "filetypes": ["python", "python-env"]
    }
  }
}
```

Multiple servers can use the same language ID. The extension starts one client
per configured server.

## Commands

- `Simple LSP Client: Restart Servers`

Use this command after changing server binaries or environment setup. Changes to
`simpleLspClient.servers` restart clients automatically.

## Manual Test

1. Build the VSIX:

   ```sh
   make vsix
   ```

2. Install `simple-lsp-client-0.0.1.vsix` in VS Code.

3. Add a test configuration:

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

4. Open a Python file.

5. Check the `Simple LSP Client` output channel for startup logs.
