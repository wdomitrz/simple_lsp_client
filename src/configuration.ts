import { workspace } from "vscode";
import { appendOutputLine } from "./output";
import type {
  NamedFormatterConfig,
  NamedServerConfig,
  NonEmptyStringArray,
  ProcessConfig,
  RawFormatterConfig,
  RawProcessConfig,
  RawServerConfig,
  ServerConfig,
} from "./model";

export const configSection = "simpleLspClient";
export const serversConfigKey = "servers";
export const formattersConfigKey = "formatters";

export function readServerConfigs(): NamedServerConfig[] {
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

export function readFormatterConfigs(): NamedFormatterConfig[] {
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
