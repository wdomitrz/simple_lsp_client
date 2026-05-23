import { spawn, type SpawnOptionsWithoutStdio } from "node:child_process";
import {
  languages,
  Range,
  TextEdit,
  type CancellationToken,
  type Disposable,
  type TextDocument,
} from "vscode";
import { readFormatterConfigs } from "./configuration";
import {
  createLanguageDocumentSelector,
  getDocumentFileName,
} from "./documents";
import { formatExitStatus } from "./errors";
import { appendOutputLine } from "./output";
import { getRootWorkspaceFolder } from "./workspaceRoot";
import type { NamedFormatterConfig } from "./model";

let formatterDisposables: Disposable[] = [];

export function reloadFormatters(): void {
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

export function disposeFormatters(): void {
  for (const disposable of formatterDisposables) {
    disposable.dispose();
  }

  formatterDisposables = [];
}

export function getFormatterStatusLines(): string[] {
  const formatters = readFormatterConfigs();
  return [
    `Formatters configured: ${String(formatters.length)}`,
    ...formatters.map(
      (formatter) =>
        `- ${formatter.name}: cmd=${formatter.cmd.join(" ")}; filetypes=${formatter.filetypes.join(", ")}`,
    ),
  ];
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

  const [command, ...rawArgs] = formatter.cmd;
  const args = rawArgs.map((arg) => expandFormatterPlaceholder(arg, document));
  const workspaceFolder = getRootWorkspaceFolder();
  const options: SpawnOptionsWithoutStdio = {
    env: { ...process.env, ...formatter.env },
  };

  if (workspaceFolder !== undefined) {
    options.cwd = workspaceFolder.uri.fsPath;
  }

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

function expandFormatterPlaceholder(
  value: string,
  document: TextDocument,
): string {
  return value
    .replaceAll("${file}", getDocumentFileName(document))
    .replaceAll("${filetype}", document.languageId);
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
