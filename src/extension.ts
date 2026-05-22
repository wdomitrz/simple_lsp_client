import {
  window,
  commands,
  workspace,
  type ExtensionContext,
  type OutputChannel,
} from "vscode";
import {
  LanguageClient,
  type DocumentSelector,
  type LanguageClientOptions,
  type ServerOptions,
} from "vscode-languageclient/node";

type NonEmptyStringArray = [string, ...string[]];

interface ServerConfig {
  cmd: NonEmptyStringArray;
  filetypes: NonEmptyStringArray;
}

interface NamedServerConfig extends ServerConfig {
  name: string;
}

const configSection = "simpleLspClient";
const serversConfigKey = "servers";

let outputChannel: OutputChannel | undefined;
let clients: LanguageClient[] = [];

export function activate(context: ExtensionContext): void {
  outputChannel = window.createOutputChannel("Simple LSP Client");
  context.subscriptions.push(outputChannel);

  context.subscriptions.push(
    commands.registerCommand("simpleLspClient.restartServers", async () => {
      outputChannel?.appendLine(
        "Restart command invoked; restarting LSP clients.",
      );
      await restartClients();
    }),
    workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(`${configSection}.${serversConfigKey}`)) {
        outputChannel?.appendLine(
          "Configuration changed; restarting LSP clients.",
        );
        void restartClients();
      }
    }),
  );

  void restartClients();
}

export async function deactivate(): Promise<void> {
  await stopClients();
  outputChannel?.dispose();
  outputChannel = undefined;
}

async function restartClients(): Promise<void> {
  await stopClients();

  const servers = readServerConfigs();
  if (servers.length === 0) {
    outputChannel?.appendLine("No LSP servers configured.");
    return;
  }

  await Promise.all(servers.map((server) => startClient(server)));
}

async function stopClients(): Promise<void> {
  const clientsToStop = clients;
  clients = [];

  await Promise.all(
    clientsToStop.map(async (client) => {
      try {
        await client.stop();
      } catch (error) {
        outputChannel?.appendLine(
          `Failed to stop LSP client: ${formatError(error)}`,
        );
      }
    }),
  );
}

async function startClient(config: NamedServerConfig): Promise<void> {
  const [command, ...args] = config.cmd;
  const documentSelector = createDocumentSelector(config.filetypes);
  const serverOptions: ServerOptions = {
    command,
    args,
  };
  const clientOptions: LanguageClientOptions = {
    documentSelector,
    outputChannel: getOutputChannel(),
  };
  const client = new LanguageClient(
    `simple-lsp-client.${config.name}`,
    `Simple LSP Client: ${config.name}`,
    serverOptions,
    clientOptions,
  );

  clients.push(client);
  outputChannel?.appendLine(`Starting ${config.name}: ${config.cmd.join(" ")}`);
  await client.start();
}

function createDocumentSelector(
  filetypes: readonly string[],
): DocumentSelector {
  return filetypes.flatMap((language) => [
    { scheme: "file", language },
    { scheme: "untitled", language },
  ]);
}

function readServerConfigs(): NamedServerConfig[] {
  const servers = workspace
    .getConfiguration(configSection)
    .get<Record<string, ServerConfig>>(serversConfigKey, {});

  return Object.entries(servers).map(([name, config]) => ({ name, ...config }));
}

function getOutputChannel(): OutputChannel {
  outputChannel ??= window.createOutputChannel("Simple LSP Client");
  return outputChannel;
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
