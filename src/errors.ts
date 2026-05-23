export function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export function formatExitStatus(
  code: number | null,
  signal: NodeJS.Signals | null,
): string {
  if (code !== null) {
    return `code ${String(code)}`;
  }

  return signal === null ? "unknown status" : `signal ${signal}`;
}
