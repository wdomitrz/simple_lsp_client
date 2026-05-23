import { workspace, type WorkspaceFolder } from "vscode";

export function getRootWorkspaceFolder(): WorkspaceFolder | undefined {
  return workspace.workspaceFolders?.[0];
}

export function formatWorkspaceFolder(
  workspaceFolder: WorkspaceFolder | undefined,
): string {
  if (workspaceFolder === undefined) {
    return "";
  }

  return `; workspace=${workspaceFolder.uri.fsPath}`;
}
