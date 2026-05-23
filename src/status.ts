import { getFormatterStatusLines } from "./formatters";
import { getClientStatusLines } from "./lspClients";
import { getOutputChannel } from "./output";
import { readFormatterConfigs, readServerConfigs } from "./configuration";

export function showStatus(): void {
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

export function listConfiguredServers(): void {
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

export function listConfiguredFormatters(): void {
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
