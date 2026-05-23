import type { TextDocument, WorkspaceFolder } from "vscode";
import type { LanguageClient } from "vscode-languageclient/node";

export type NonEmptyStringArray = [string, ...string[]];
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface DocumentTarget {
  scheme?: "file" | "untitled";
  language: string;
}

export type DocumentSelector = DocumentTarget[];

export interface ProcessConfig {
  cmd: NonEmptyStringArray;
  filetypes: NonEmptyStringArray;
  env?: Record<string, string>;
}

export interface RawProcessConfig {
  cmd?: string[];
  filetypes?: string[];
  env?: Record<string, string>;
}

export interface ServerConfig extends ProcessConfig {
  initializationOptions?: JsonValue;
}

export interface RawServerConfig extends RawProcessConfig {
  initializationOptions?: JsonValue;
}

export type FormatterConfig = ProcessConfig;
export type RawFormatterConfig = RawProcessConfig;

export interface NamedServerConfig extends ServerConfig {
  name: string;
}

export interface NamedFormatterConfig extends FormatterConfig {
  name: string;
}

export interface ActiveClient {
  config: NamedServerConfig;
  client: LanguageClient;
  workspaceFolder: WorkspaceFolder | undefined;
}

export interface FormatterRunRequest {
  formatter: NamedFormatterConfig;
  document: TextDocument;
  input: string;
}
