import { commands, workspace, type ExtensionContext } from "vscode";
import {
  configSection,
  formattersConfigKey,
  serversConfigKey,
} from "./configuration";
import { disposeFormatters, reloadFormatters } from "./formatters";
import {
  queueRestartClients,
  startClientsForDocument,
  stopClients,
} from "./lspClients";
import { activateOutput, appendOutputLine, disposeOutput } from "./output";
import {
  listConfiguredFormatters,
  listConfiguredServers,
  showStatus,
} from "./status";

export function activate(context: ExtensionContext): void {
  activateOutput(context);

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
  disposeOutput();
}
