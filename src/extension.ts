import {
  commands,
  window,
  workspace,
  type ExtensionContext,
  type OutputChannel,
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

interface ServerConfig {
  cmd: NonEmptyStringArray;
  filetypes: NonEmptyStringArray;
  env?: Record<string, string>;
  initializationOptions?: object;
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
    commands.registerCommand("simpleLspClient.showStatus", () => {
      showStatus();
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

  activeClients.push({ config, client, workspaceFolder });
  outputChannel?.appendLine(
    `Starting ${config.name}: ${config.cmd.join(" ")}${formatWorkspaceFolder(workspaceFolder)}`,
  );
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

function getRootWorkspaceFolder(): WorkspaceFolder | undefined {
  return workspace.workspaceFolders?.[0];
}

function showStatus(): void {
  const channel = getOutputChannel();
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

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
