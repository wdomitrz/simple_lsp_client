import type { TextDocument } from "vscode";
import type { DocumentSelector } from "./model";

export function createFileDocumentSelector(
  filetypes: readonly string[],
): DocumentSelector {
  return filetypes.flatMap((language) => [
    { scheme: "file", language },
    { scheme: "untitled", language },
  ]);
}

export function createLanguageDocumentSelector(
  filetypes: readonly string[],
): DocumentSelector {
  return filetypes.map((language) => ({ language }));
}

export function isSupportedDocument(document: TextDocument): boolean {
  return document.uri.scheme === "file" || document.uri.scheme === "untitled";
}

export function documentMatchesFiletypes(
  filetypes: readonly string[],
  document: TextDocument,
): boolean {
  return (
    isSupportedDocument(document) && filetypes.includes(document.languageId)
  );
}

export function getDocumentFileName(document: TextDocument): string {
  if (document.uri.scheme === "file") {
    return document.uri.fsPath;
  }

  return document.fileName;
}
