import { window, type ExtensionContext, type OutputChannel } from "vscode";

let channel: OutputChannel | undefined;

export function activateOutput(context: ExtensionContext): void {
  channel = window.createOutputChannel("Simple LSP Client");
  context.subscriptions.push(channel);
}

export function disposeOutput(): void {
  channel?.dispose();
  channel = undefined;
}

export function getOutputChannel(): OutputChannel {
  channel ??= window.createOutputChannel("Simple LSP Client");
  return channel;
}

export function appendOutputLine(message: string): void {
  channel?.appendLine(message);
}
