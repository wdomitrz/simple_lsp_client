import { spawn, type SpawnOptionsWithoutStdio } from "node:child_process";
import { homedir } from "node:os";
import { basename, relative, sep } from "node:path";
import {
  commands,
  languages,
  Range,
  TextEdit,
  window,
  workspace,
  type CancellationToken,
  type Disposable,
  type ExtensionContext,
  type OutputChannel,
  type TextDocument,
  type WorkspaceFolder,
} from "vscode";
import {
  LanguageClient,
  State,
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

interface DocumentTarget {
  scheme?: "file" | "untitled";
  language: string;
}

type DocumentSelector = DocumentTarget[];

interface ProcessConfig {
  cmd: NonEmptyStringArray;
  filetypes: NonEmptyStringArray;
  env?: Record<string, string>;
}

interface RawProcessConfig {
  cmd?: string[];
  filetypes?: string[];
  env?: Record<string, string>;
}

interface ServerConfig extends ProcessConfig {
  initializationOptions?: JsonValue;
}

interface RawServerConfig extends RawProcessConfig {
  initializationOptions?: JsonValue;
}

type RawFormatterConfig = RawProcessConfig;

interface NamedServerConfig extends ServerConfig {
  name: string;
}

interface NamedFormatterConfig extends ProcessConfig {
  name: string;
}

interface ActiveClient {
  config: NamedServerConfig;
  client: LanguageClient;
  workspaceFolder: WorkspaceFolder | undefined;
}

interface VariableValues extends Record<string, string> {
  workspaceFolder: string;
  workspaceFolderBasename: string;
  cwd: string;
  userHome: string;
  pathSeparator: string;
  execPath: string;
}

interface FormatterVariableValues extends VariableValues {
  file: string;
  filetype: string;
  relativeFile: string;
}

const configSection = "simpleLspClient";
const serversConfigKey = "servers";
const formattersConfigKey = "formatters";
const outputChannelName = "Simple LSP Client";

let outputChannel: OutputChannel | undefined;
let activeClients: ActiveClient[] = [];
let formatterDisposables: Disposable[] = [];
let restartQueue: Promise<void> = Promise.resolve();

export function activate(context: ExtensionContext): void {
  outputChannel = window.createOutputChannel(outputChannelName);
  context.subscriptions.push(outputChannel);

  context.subscriptions.push(
    commands.registerCommand("simpleLspClient.restartServers", async () => {
      appendOutputLine("Restart command invoked; restarting LSP clients.");
      await queueRestartClients();
    }),
    commands.registerCommand("simpleLspClient.showStatus", () => {
      showStatus();
    }),
    commands.registerCommand("simpleLspClient.listConfiguredServers", () => {
      listConfiguredServers();
    }),
    commands.registerCommand("simpleLspClient.listConfiguredFormatters", () => {
      listConfiguredFormatters();
    }),
    commands.registerCommand("simpleLspClient.listVariables", () => {
      listVariables();
    }),
    workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(`${configSection}.${serversConfigKey}`)) {
        appendOutputLine("Configuration changed; restarting LSP clients.");
        void queueRestartClients();
      }

      if (
        event.affectsConfiguration(`${configSection}.${formattersConfigKey}`)
      ) {
        appendOutputLine(
          "Formatter configuration changed; reloading formatters.",
        );
        reloadFormatters();
      }
    }),
    workspace.onDidOpenTextDocument((document) => {
      void startClientsForDocument(document);
    }),
  );

  reloadFormatters();
  void queueRestartClients();
}

export async function deactivate(): Promise<void> {
  await stopClients();
  disposeFormatters();
  outputChannel?.dispose();
  outputChannel = undefined;
}

function getOutputChannel(): OutputChannel {
  outputChannel ??= window.createOutputChannel(outputChannelName);
  return outputChannel;
}

function appendOutputLine(message: string): void {
  outputChannel?.appendLine(message);
}

function queueRestartClients(): Promise<void> {
  restartQueue = restartQueue.then(restartClients, restartClients);
  return restartQueue;
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

async function stopClients(): Promise<void> {
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

async function startClientsForDocument(document: TextDocument): Promise<void> {
  if (!isSupportedLspDocument(document)) {
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

async function startClient(config: NamedServerConfig): Promise<void> {
  const workspaceFolder = getRootWorkspaceFolder();
  const variables = createVariableValues(workspaceFolder);
  const [command, ...args] = expandCommand(config.cmd, variables);
  const serverOptions: ServerOptions = {
    command,
    args,
    options: {
      cwd: variables.cwd,
      env: createProcessEnv(config.env, variables),
    },
  };
  const clientOptions: LanguageClientOptions = {
    documentSelector: createLspDocumentSelector(config.filetypes),
    outputChannel: getOutputChannel(),
  };

  if (workspaceFolder !== undefined) {
    clientOptions.workspaceFolder = workspaceFolder;
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
    `Starting ${config.name}: ${[command, ...args].join(" ")}${formatWorkspaceFolder(workspaceFolder)}`,
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
  return (
    isSupportedLspDocument(document) &&
    server.filetypes.includes(document.languageId)
  );
}

function reloadFormatters(): void {
  disposeFormatters();

  formatterDisposables = readFormatterConfigs().map((formatter) =>
    languages.registerDocumentFormattingEditProvider(
      createLanguageDocumentSelector(formatter.filetypes),
      {
        async provideDocumentFormattingEdits(document, _options, token) {
          const originalText = document.getText();
          const formattedText = await runFormatter(
            formatter,
            document,
            originalText,
            token,
          );
          const fullRange = new Range(
            document.positionAt(0),
            document.positionAt(originalText.length),
          );

          return [TextEdit.replace(fullRange, formattedText)];
        },
      },
    ),
  );
}

function disposeFormatters(): void {
  for (const disposable of formatterDisposables) {
    disposable.dispose();
  }

  formatterDisposables = [];
}

async function runFormatter(
  formatter: NamedFormatterConfig,
  document: TextDocument,
  input: string,
  token: CancellationToken,
): Promise<string> {
  if (token.isCancellationRequested) {
    throw new Error(`Formatting with "${formatter.name}" was cancelled.`);
  }

  const workspaceFolder = getRootWorkspaceFolder();
  const variables = createFormatterVariableValues(document, workspaceFolder);
  const [command, ...args] = expandCommand(formatter.cmd, variables);
  const options: SpawnOptionsWithoutStdio = {
    cwd: variables.cwd,
    env: createProcessEnv(formatter.env, variables),
  };

  appendOutputLine(
    `Formatting with ${formatter.name}: ${[command, ...args].join(" ")}`,
  );

  return runFormatterProcess(
    formatter.name,
    command,
    args,
    options,
    input,
    token,
  );
}

function runFormatterProcess(
  formatterName: string,
  command: string,
  args: string[],
  options: SpawnOptionsWithoutStdio,
  input: string,
  token: CancellationToken,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, options);
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const cleanup: Disposable[] = [];
    let settled = false;

    const settle = (callback: () => void): void => {
      if (settled) {
        return;
      }

      settled = true;
      for (const disposable of cleanup) {
        disposable.dispose();
      }
      callback();
    };

    cleanup.push(
      token.onCancellationRequested(() => {
        settle(() => {
          child.kill();
          reject(
            new Error(`Formatting with "${formatterName}" was cancelled.`),
          );
        });
      }),
    );

    child.stdout.on("data", (chunk: Buffer) => {
      stdout.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr.push(chunk);
    });
    child.stdin.on("error", () => {
      // The process may exit before reading stdin; close/error handling reports the failure.
    });
    child.on("error", (error) => {
      settle(() => {
        reject(error);
      });
    });
    child.on("close", (code, signal) => {
      settle(() => {
        if (code === 0) {
          resolve(Buffer.concat(stdout).toString("utf8"));
          return;
        }

        const stderrText = Buffer.concat(stderr).toString("utf8").trim();
        reject(
          new Error(
            `Formatter "${formatterName}" exited with ${formatExitStatus(code, signal)}${stderrText.length === 0 ? "" : `: ${stderrText}`}`,
          ),
        );
      });
    });

    child.stdin.end(input, "utf8");
  });
}

function readServerConfigs(): NamedServerConfig[] {
  const servers = workspace
    .getConfiguration(configSection)
    .get<Record<string, RawServerConfig>>(serversConfigKey, {});

  return Object.entries(servers).flatMap(([name, config]) => {
    if (isValidServerConfig(config)) {
      return [{ name, ...config }];
    }

    appendOutputLine(
      `Skipping invalid LSP server config "${name}". Expected non-empty "cmd" and "filetypes" arrays.`,
    );
    return [];
  });
}

function readFormatterConfigs(): NamedFormatterConfig[] {
  const formatters = workspace
    .getConfiguration(configSection)
    .get<Record<string, RawFormatterConfig>>(formattersConfigKey, {});

  return Object.entries(formatters).flatMap(([name, config]) => {
    if (isValidProcessConfig(config)) {
      return [{ name, ...config }];
    }

    appendOutputLine(
      `Skipping invalid formatter config "${name}". Expected non-empty "cmd" and "filetypes" arrays.`,
    );
    return [];
  });
}

function isValidServerConfig(config: RawServerConfig): config is ServerConfig {
  return isValidProcessConfig(config);
}

function isValidProcessConfig(
  config: RawProcessConfig,
): config is ProcessConfig {
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

function createLspDocumentSelector(
  filetypes: readonly string[],
): DocumentSelector {
  return filetypes.flatMap((language) => [
    { scheme: "file", language },
    { scheme: "untitled", language },
  ]);
}

function createLanguageDocumentSelector(
  filetypes: readonly string[],
): DocumentSelector {
  return filetypes.map((language) => ({ language }));
}

function isSupportedLspDocument(document: TextDocument): boolean {
  return document.uri.scheme === "file" || document.uri.scheme === "untitled";
}

function getDocumentFileName(document: TextDocument): string {
  if (document.uri.scheme === "file") {
    return document.uri.fsPath;
  }

  return document.fileName;
}

function getRootWorkspaceFolder(): WorkspaceFolder | undefined {
  return workspace.workspaceFolders?.[0];
}

function createVariableValues(
  workspaceFolder: WorkspaceFolder | undefined,
): VariableValues {
  const workspaceFolderPath = workspaceFolder?.uri.fsPath ?? "";
  const cwd =
    workspaceFolderPath.length === 0 ? process.cwd() : workspaceFolderPath;

  return {
    workspaceFolder: workspaceFolderPath,
    workspaceFolderBasename:
      workspaceFolderPath.length === 0 ? "" : basename(workspaceFolderPath),
    cwd,
    userHome: homedir(),
    pathSeparator: sep,
    execPath: process.execPath,
  };
}

function createFormatterVariableValues(
  document: TextDocument,
  workspaceFolder: WorkspaceFolder | undefined,
): FormatterVariableValues {
  const baseVariables = createVariableValues(workspaceFolder);
  const file = getDocumentFileName(document);

  return {
    ...baseVariables,
    file,
    filetype: document.languageId,
    relativeFile: getRelativeFileName(file, workspaceFolder),
  };
}

function getRelativeFileName(
  fileName: string,
  workspaceFolder: WorkspaceFolder | undefined,
): string {
  if (workspaceFolder === undefined || fileName.length === 0) {
    return fileName;
  }

  return relative(workspaceFolder.uri.fsPath, fileName);
}

function expandCommand(
  command: NonEmptyStringArray,
  variables: Record<string, string>,
): NonEmptyStringArray {
  const [executable, ...args] = command;
  return [
    expandVariables(executable, variables),
    ...args.map((arg) => expandVariables(arg, variables)),
  ];
}

function createProcessEnv(
  configuredEnv: Record<string, string> | undefined,
  variables: VariableValues,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    SIMPLE_LSP_CLIENT_CWD: variables.cwd,
    SIMPLE_LSP_CLIENT_USER_HOME: variables.userHome,
    SIMPLE_LSP_CLIENT_PATH_SEPARATOR: variables.pathSeparator,
    SIMPLE_LSP_CLIENT_EXEC_PATH: variables.execPath,
  };

  if (variables.workspaceFolder.length > 0) {
    env.SIMPLE_LSP_CLIENT_WORKSPACE_FOLDER = variables.workspaceFolder;
    env.SIMPLE_LSP_CLIENT_WORKSPACE_FOLDER_BASENAME =
      variables.workspaceFolderBasename;
  }

  for (const [key, value] of Object.entries(configuredEnv ?? {})) {
    env[key] = expandVariables(value, variables);
  }

  return env;
}

function expandVariables(
  value: string,
  variables: Record<string, string>,
): string {
  let expanded = value;

  for (const [name, replacement] of Object.entries(variables)) {
    expanded = expanded.replaceAll(`\${${name}}`, replacement);
  }

  return expanded;
}

function showStatus(): void {
  const channel = getOutputChannel();
  channel.appendLine("");
  channel.appendLine("Simple LSP Client status:");

  for (const line of getClientStatusLines()) {
    channel.appendLine(line);
  }

  for (const line of getFormatterStatusLines()) {
    channel.appendLine(line);
  }

  channel.show(true);
}

function listConfiguredServers(): void {
  const channel = getOutputChannel();
  const servers = readServerConfigs();

  channel.appendLine("");
  channel.appendLine(`Configured LSP servers: ${String(servers.length)}`);
  for (const server of servers) {
    channel.appendLine(
      `- ${server.name}: cmd=${server.cmd.join(" ")}; filetypes=${server.filetypes.join(", ")}`,
    );
  }

  channel.show(true);
}

function listConfiguredFormatters(): void {
  const channel = getOutputChannel();
  const formatters = readFormatterConfigs();

  channel.appendLine("");
  channel.appendLine(`Configured formatters: ${String(formatters.length)}`);
  for (const formatter of formatters) {
    channel.appendLine(
      `- ${formatter.name}: cmd=${formatter.cmd.join(" ")}; filetypes=${formatter.filetypes.join(", ")}`,
    );
  }

  channel.show(true);
}

function listVariables(): void {
  const channel = getOutputChannel();
  const variables = createVariableValues(getRootWorkspaceFolder());

  channel.appendLine("");
  channel.appendLine("Available variables:");
  for (const [name, value] of Object.entries(variables)) {
    channel.appendLine(`- \${${name}} = ${value}`);
  }

  channel.appendLine("");
  channel.appendLine("Server environment variables:");
  channel.appendLine("- SIMPLE_LSP_CLIENT_WORKSPACE_FOLDER");
  channel.appendLine("- SIMPLE_LSP_CLIENT_WORKSPACE_FOLDER_BASENAME");
  channel.appendLine("- SIMPLE_LSP_CLIENT_CWD");
  channel.appendLine("- SIMPLE_LSP_CLIENT_USER_HOME");
  channel.appendLine("- SIMPLE_LSP_CLIENT_PATH_SEPARATOR");
  channel.appendLine("- SIMPLE_LSP_CLIENT_EXEC_PATH");
  channel.appendLine("");
  channel.appendLine("Formatter-only variables:");
  channel.appendLine("- ${file}");
  channel.appendLine("- ${relativeFile}");
  channel.appendLine("- ${filetype}");
  channel.show(true);
}

function getClientStatusLines(): string[] {
  if (activeClients.length === 0) {
    return ["- No active LSP clients."];
  }

  return activeClients.map(
    ({ client, config, workspaceFolder }) =>
      `- ${config.name}: ${formatState(client.state)}; cmd=${config.cmd.join(" ")}; filetypes=${config.filetypes.join(", ")}${formatWorkspaceFolder(workspaceFolder)}`,
  );
}

function getFormatterStatusLines(): string[] {
  const formatters = readFormatterConfigs();
  return [
    `Formatters configured: ${String(formatters.length)}`,
    ...formatters.map(
      (formatter) =>
        `- ${formatter.name}: cmd=${formatter.cmd.join(" ")}; filetypes=${formatter.filetypes.join(", ")}`,
    ),
  ];
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

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function formatExitStatus(
  code: number | null,
  signal: NodeJS.Signals | null,
): string {
  if (code !== null) {
    return `code ${String(code)}`;
  }

  return signal === null ? "unknown status" : `signal ${signal}`;
}
