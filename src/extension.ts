import {
  commands,
  window,
  workspace,
  type ExtensionContext,
  type OutputChannel,
  type TextDocument,
  type WorkspaceFolder,
} from "vscode";
import {
  LanguageClient,
  State,
  type DocumentSelector,
  type LanguageClientOptions,
  type ServerOptions,
} from "vscode-languageclient/node";

type NonEmptyStringArray = [string, ...string[]];
type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

interface ServerConfig {
  cmd: NonEmptyStringArray;
  filetypes: NonEmptyStringArray;
  env?: Record<string, string>;
  initializationOptions?: JsonValue;
}

interface RawServerConfig {
  cmd?: string[];
  filetypes?: string[];
  env?: Record<string, string>;
  initializationOptions?: JsonValue;
}

interface NamedServerConfig extends ServerConfig {
  name: string;
}

interface ActiveClient {
  config: NamedServerConfig;
  client: LanguageClient;
  workspaceFolder: WorkspaceFolder | undefined;
}

const configSection = "simpleLspClient";
const serversConfigKey = "servers";

let outputChannel: OutputChannel | undefined;
let activeClients: ActiveClient[] = [];
let restartQueue: Promise<void> = Promise.resolve();

export function activate(context: ExtensionContext): void {
  outputChannel = window.createOutputChannel("Simple LSP Client");
  context.subscriptions.push(outputChannel);

  context.subscriptions.push(
    commands.registerCommand("simpleLspClient.restartServers", async () => {
      outputChannel?.appendLine(
        "Restart command invoked; restarting LSP clients.",
      );
      await queueRestart();
    }),
    commands.registerCommand("simpleLspClient.showStatus", () => {
      showStatus();
    }),
    workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(`${configSection}.${serversConfigKey}`)) {
        outputChannel?.appendLine(
          "Configuration changed; restarting LSP clients.",
        );
        void queueRestart();
      }
    }),
    workspace.onDidOpenTextDocument((document) => {
      void startClientsForDocument(document);
    }),
  );

  void queueRestart();
}

export async function deactivate(): Promise<void> {
  await stopClients();
  outputChannel?.dispose();
  outputChannel = undefined;
}

async function restartClients(): Promise<void> {
  await stopClients();

  const servers = readServerConfigs().filter((server) =>
    shouldRunServer(server),
  );
  if (servers.length === 0) {
    outputChannel?.appendLine("No matching LSP servers for open documents.");
    return;
  }

  await Promise.all(servers.map((server) => startClient(server)));
}

function queueRestart(): Promise<void> {
  restartQueue = restartQueue.then(restartClients, restartClients);
  return restartQueue;
}

async function stopClients(): Promise<void> {
  const clientsToStop = activeClients;
  activeClients = [];

  await Promise.all(
    clientsToStop.map(async ({ client, config }) => {
      try {
        await client.stop();
      } catch (error) {
        outputChannel?.appendLine(
          `Failed to stop LSP client "${config.name}": ${formatError(error)}`,
        );
      }
    }),
  );
}

async function startClient(config: NamedServerConfig): Promise<void> {
  const [command, ...args] = config.cmd;
  const documentSelector = createDocumentSelector(config.filetypes);
  const workspaceFolder = getRootWorkspaceFolder();
  const serverOptions: ServerOptions = {
    command,
    args,
  };
  const clientOptions: LanguageClientOptions = {
    documentSelector,
    outputChannel: getOutputChannel(),
  };

  if (workspaceFolder !== undefined) {
    serverOptions.options = {
      cwd: workspaceFolder.uri.fsPath,
      env: { ...process.env, ...config.env },
    };
    clientOptions.workspaceFolder = workspaceFolder;
  } else if (config.env !== undefined) {
    serverOptions.options = {
      env: { ...process.env, ...config.env },
    };
  }

  if (config.initializationOptions !== undefined) {
    clientOptions.initializationOptions = config.initializationOptions;
  }
  const client = new LanguageClient(
    `simple-lsp-client.${config.name}`,
    `Simple LSP Client: ${config.name}`,
    serverOptions,
    clientOptions,
  );

  outputChannel?.appendLine(
    `Starting ${config.name}: ${config.cmd.join(" ")}${formatWorkspaceFolder(workspaceFolder)}`,
  );
  try {
    await client.start();
    activeClients.push({ config, client, workspaceFolder });
  } catch (error) {
    outputChannel?.appendLine(
      `Failed to start LSP client "${config.name}": ${formatError(error)}`,
    );
    await stopFailedClient(client, config);
  }
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
    .get<Record<string, RawServerConfig>>(serversConfigKey, {});

  return Object.entries(servers).flatMap(([name, config]) => {
    if (isValidServerConfig(config)) {
      return [{ name, ...config }];
    }

    outputChannel?.appendLine(
      `Skipping invalid LSP server config "${name}". Expected non-empty "cmd" and "filetypes" arrays.`,
    );
    return [];
  });
}

function getRootWorkspaceFolder(): WorkspaceFolder | undefined {
  return workspace.workspaceFolders?.[0];
}

async function startClientsForDocument(document: TextDocument): Promise<void> {
  if (!isSupportedDocument(document)) {
    return;
  }

  await restartQueue;

  const servers = readServerConfigs().filter(
    (server) =>
      serverMatchesDocument(server, document) &&
      !activeClients.some(({ config }) => config.name === server.name),
  );

  await Promise.all(servers.map((server) => startClient(server)));
}

function showStatus(): void {
  const channel = getOutputChannel();
  channel.appendLine("");
  channel.appendLine("Simple LSP Client status:");

  if (activeClients.length === 0) {
    channel.appendLine("- No active LSP clients.");
    channel.show(true);
    return;
  }

  for (const { client, config, workspaceFolder } of activeClients) {
    channel.appendLine(
      `- ${config.name}: ${formatState(client.state)}; cmd=${config.cmd.join(" ")}; filetypes=${config.filetypes.join(", ")}${formatWorkspaceFolder(workspaceFolder)}`,
    );
  }

  channel.show(true);
}

function formatState(state: State): string {
  switch (state) {
    case State.Running:
      return "running";
    case State.Starting:
      return "starting";
    case State.Stopped:
      return "stopped";
  }
}

function formatWorkspaceFolder(
  workspaceFolder: WorkspaceFolder | undefined,
): string {
  if (workspaceFolder === undefined) {
    return "";
  }

  return `; workspace=${workspaceFolder.uri.fsPath}`;
}

function getOutputChannel(): OutputChannel {
  outputChannel ??= window.createOutputChannel("Simple LSP Client");
  return outputChannel;
}

async function stopFailedClient(
  client: LanguageClient,
  config: NamedServerConfig,
): Promise<void> {
  try {
    await client.stop();
  } catch (error) {
    outputChannel?.appendLine(
      `Failed to clean up LSP client "${config.name}" after startup failure: ${formatError(error)}`,
    );
  }
}

function isValidServerConfig(config: RawServerConfig): config is ServerConfig {
  return (
    config.cmd !== undefined &&
    config.filetypes !== undefined &&
    isNonEmptyStringArray(config.cmd) &&
    isNonEmptyStringArray(config.filetypes)
  );
}

function isNonEmptyStringArray(value: string[]): value is NonEmptyStringArray {
  return value.length > 0 && value.every((item) => item.length > 0);
}

function shouldRunServer(server: NamedServerConfig): boolean {
  return workspace.textDocuments.some((document) =>
    serverMatchesDocument(server, document),
  );
}

function serverMatchesDocument(
  server: NamedServerConfig,
  document: TextDocument,
): boolean {
  return (
    isSupportedDocument(document) &&
    server.filetypes.includes(document.languageId)
  );
}

function isSupportedDocument(document: TextDocument): boolean {
  return document.uri.scheme === "file" || document.uri.scheme === "untitled";
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
