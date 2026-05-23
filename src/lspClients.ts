import { workspace, type TextDocument } from "vscode";
import {
  LanguageClient,
  State,
  type LanguageClientOptions,
  type ServerOptions,
} from "vscode-languageclient/node";
import { readServerConfigs } from "./configuration";
import {
  createFileDocumentSelector,
  documentMatchesFiletypes,
  isSupportedDocument,
} from "./documents";
import { formatError } from "./errors";
import { getOutputChannel, appendOutputLine } from "./output";
import { formatWorkspaceFolder, getRootWorkspaceFolder } from "./workspaceRoot";
import type { ActiveClient, NamedServerConfig } from "./model";

let activeClients: ActiveClient[] = [];
let restartQueue: Promise<void> = Promise.resolve();

export function queueRestartClients(): Promise<void> {
  restartQueue = restartQueue.then(restartClients, restartClients);
  return restartQueue;
}

export async function stopClients(): Promise<void> {
  const clientsToStop = activeClients;
  activeClients = [];

  await Promise.all(
    clientsToStop.map(async ({ client, config }) => {
      try {
        await client.stop();
      } catch (error) {
        appendOutputLine(
          `Failed to stop LSP client "${config.name}": ${formatError(error)}`,
        );
      }
    }),
  );
}

export async function startClientsForDocument(
  document: TextDocument,
): Promise<void> {
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

export function getClientStatusLines(): string[] {
  if (activeClients.length === 0) {
    return ["- No active LSP clients."];
  }

  return activeClients.map(
    ({ client, config, workspaceFolder }) =>
      `- ${config.name}: ${formatState(client.state)}; cmd=${config.cmd.join(" ")}; filetypes=${config.filetypes.join(", ")}${formatWorkspaceFolder(workspaceFolder)}`,
  );
}

async function restartClients(): Promise<void> {
  await stopClients();

  const servers = readServerConfigs().filter((server) =>
    shouldRunServer(server),
  );
  if (servers.length === 0) {
    appendOutputLine("No matching LSP servers for open documents.");
    return;
  }

  await Promise.all(servers.map((server) => startClient(server)));
}

async function startClient(config: NamedServerConfig): Promise<void> {
  const [command, ...args] = config.cmd;
  const workspaceFolder = getRootWorkspaceFolder();
  const serverOptions: ServerOptions = { command, args };
  const clientOptions: LanguageClientOptions = {
    documentSelector: createFileDocumentSelector(config.filetypes),
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

  appendOutputLine(
    `Starting ${config.name}: ${config.cmd.join(" ")}${formatWorkspaceFolder(workspaceFolder)}`,
  );
  try {
    await client.start();
    activeClients.push({ config, client, workspaceFolder });
  } catch (error) {
    appendOutputLine(
      `Failed to start LSP client "${config.name}": ${formatError(error)}`,
    );
    await stopFailedClient(client, config);
  }
}

async function stopFailedClient(
  client: LanguageClient,
  config: NamedServerConfig,
): Promise<void> {
  try {
    await client.stop();
  } catch (error) {
    appendOutputLine(
      `Failed to clean up LSP client "${config.name}" after startup failure: ${formatError(error)}`,
    );
  }
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
  return documentMatchesFiletypes(server.filetypes, document);
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
